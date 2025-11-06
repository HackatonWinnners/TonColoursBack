#!/usr/bin/env node
/*
 * Utility script to derive the deterministic address of the Ton Colours NFT collection
 * before deploying the smart contract. It also optionally writes the StateInit/code/data
 * BOC files to disk so they can be used with manual deployment tools.
 */

import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import TonWeb from 'tonweb';
import dotenv from 'dotenv';
import { mnemonicToPrivateKey } from '@ton/crypto';

const HELP_TEXT = `Usage: npm run derive:collection-address [-- [options]]

Options:
  --output=<dir>        Directory where StateInit/code/data BOCs will be written (default: build)
  --no-artifacts        Skip writing BOC artifacts to disk; only print the derived address
  --json                Print the resulting data as a JSON object instead of plain text
  -h, --help            Show this help message

Environment variables used:
  MINT_WALLET_MNEMONIC             24-word seed phrase used to derive the default admin address
  NFT_COLLECTION_ADMIN_ADDRESS     (optional) pre-defined admin address; overrides mnemonic-derived address
  NFT_COLLECTION_ROYALTY_PERCENT   (optional) royalty share as decimal, e.g. 0.05 for 5%% (default 0)
  NFT_COLLECTION_ROYALTY_ADDRESS   (optional) explicit royalty recipient address (defaults to admin)
  NFT_COLLECTION_CONTENT_URI       (optional) off-chain URI for the collection metadata
  NFT_ITEM_CONTENT_BASE_URI        (optional) base URI prefix used for item metadata
  BACKEND_PUBLIC_BASE_URL          Used to derive sensible defaults for the URIs above if unset
  TON_HTTP_ENDPOINT                RPC endpoint (only used to instantiate TonWeb; not contacted here)
  TON_API_KEY                      Optional Toncenter API key for the endpoint above
  NFT_COLLECTION_STATEINIT_BASENAME(optional) basename for written artifact files (default: ton_colours_collection)
`;

dotenv.config();

const cliArgs = process.argv.slice(2);
if (cliArgs.includes('--help') || cliArgs.includes('-h')) {
  process.stdout.write(HELP_TEXT);
  process.exit(0);
}

let outputDir = 'build';
let writeArtifacts = true;
let outputJson = false;

for (const arg of cliArgs) {
  if (arg.startsWith('--output=')) {
    outputDir = arg.slice('--output='.length) || outputDir;
  } else if (arg === '--no-artifacts') {
    writeArtifacts = false;
  } else if (arg === '--json') {
    outputJson = true;
  }
}

const endpoint = (process.env.TON_HTTP_ENDPOINT?.trim() || 'https://toncenter.com/api/v2/jsonRPC');
const apiKey = process.env.TON_API_KEY?.trim();
const providerOptions = apiKey ? { apiKey } : undefined;
const provider = new TonWeb.HttpProvider(endpoint, providerOptions);
const tonweb = new TonWeb(provider);
const { NftCollection, NftItem } = TonWeb.token.nft;

function ensureDefined(value, name) {
  if (!value) {
    throw new Error(`${name} is required`);
  }
  return value;
}

function normalizeBaseUrl(value, fallback) {
  const url = (value || fallback || '').trim();
  if (!url) {
    throw new Error('BACKEND_PUBLIC_BASE_URL is required to derive default metadata URIs');
  }
  return url.replace(/\/$/, '');
}

async function resolveAdminAddress() {
  const adminRaw = process.env.NFT_COLLECTION_ADMIN_ADDRESS?.trim();
  if (adminRaw) {
    return new TonWeb.utils.Address(adminRaw);
  }

  const mnemonicRaw = ensureDefined(process.env.MINT_WALLET_MNEMONIC?.trim(), 'MINT_WALLET_MNEMONIC');
  const words = mnemonicRaw.split(/\s+/).filter(Boolean);
  if (words.length !== 24) {
    throw new Error('MINT_WALLET_MNEMONIC must contain exactly 24 words');
  }

  const keyPair = await mnemonicToPrivateKey(words);
  const WalletClass = tonweb.wallet.all.v4R2 ?? tonweb.wallet.all['v4R2'];
  if (!WalletClass) {
    throw new Error('Wallet v4R2 contract is not available in tonweb');
  }
  const wallet = new WalletClass(tonweb.provider, {
    publicKey: keyPair.publicKey,
    wc: 0,
  });
  return wallet.getAddress();
}

async function main() {
  const adminAddress = await resolveAdminAddress();
  const royaltyPercent = Number(process.env.NFT_COLLECTION_ROYALTY_PERCENT?.trim() || '0');
  if (Number.isNaN(royaltyPercent) || royaltyPercent < 0 || royaltyPercent > 1) {
    throw new Error('NFT_COLLECTION_ROYALTY_PERCENT must be a decimal between 0 and 1');
  }

  const baseUrl = normalizeBaseUrl(process.env.BACKEND_PUBLIC_BASE_URL, `http://localhost:${process.env.PORT || 3000}`);
  const collectionContentUri = (process.env.NFT_COLLECTION_CONTENT_URI?.trim()
    || `${baseUrl}/collection.json`);
  const itemContentBaseUri = (process.env.NFT_ITEM_CONTENT_BASE_URI?.trim()
    || `${baseUrl}/metadata`);

  const royaltyAddress = process.env.NFT_COLLECTION_ROYALTY_ADDRESS?.trim()
    ? new TonWeb.utils.Address(process.env.NFT_COLLECTION_ROYALTY_ADDRESS.trim())
    : adminAddress;

  const collection = new NftCollection(tonweb.provider, {
    ownerAddress: adminAddress,
    royaltyAddress,
    royalty: royaltyPercent,
    collectionContentUri,
    nftItemContentBaseUri: itemContentBaseUri,
    nftItemCodeHex: NftItem.codeHex,
  });

  const stateInit = await collection.createStateInit();
  const collectionAddress = stateInit.address;

  const result = {
    adminAddress: adminAddress.toString(true, true, true),
    royaltyAddress: royaltyAddress.toString(true, true, true),
    collectionAddress: collectionAddress.toString(true, true, true),
    collectionAddressBounceable: collectionAddress.toString(true, true, false),
    workchain: collectionAddress.wc,
    endpoint,
    collectionContentUri,
    nftItemContentBaseUri: itemContentBaseUri,
    royaltyPercent,
    artifactsWritten: false,
  };

  if (writeArtifacts) {
    const baseName = process.env.NFT_COLLECTION_STATEINIT_BASENAME?.trim() || 'ton_colours_collection';
    const targetDir = path.resolve(process.cwd(), outputDir);
    await mkdir(targetDir, { recursive: true });
    const stateInitPath = path.join(targetDir, `${baseName}.stateinit.boc`);
    const codePath = path.join(targetDir, `${baseName}.code.boc`);
    const dataPath = path.join(targetDir, `${baseName}.data.boc`);

    await writeFile(stateInitPath, Buffer.from(await stateInit.stateInit.toBoc({ idx: false })), { flag: 'w' });
    await writeFile(codePath, Buffer.from(await stateInit.code.toBoc({ idx: false })), { flag: 'w' });
    await writeFile(dataPath, Buffer.from(await stateInit.data.toBoc({ idx: false })), { flag: 'w' });

    result.artifactsWritten = true;
    result.artifacts = {
      stateInitPath,
      codePath,
      dataPath,
    };
  }

  if (outputJson) {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  } else {
    process.stdout.write('\nTon Colours NFT collection parameters\n');
    process.stdout.write('-----------------------------------\n');
    process.stdout.write(`Admin address:            ${result.adminAddress}\n`);
    process.stdout.write(`Royalty address:          ${result.royaltyAddress}\n`);
    process.stdout.write(`Collection address:       ${result.collectionAddress}\n`);
    process.stdout.write(`Bounceable (raw) address: ${result.collectionAddressBounceable}\n`);
    process.stdout.write(`Workchain:                ${result.workchain}\n`);
    process.stdout.write(`Collection metadata URI:  ${collectionContentUri}\n`);
    process.stdout.write(`Item content base URI:    ${itemContentBaseUri}\n`);
    process.stdout.write(`Royalty percent:          ${royaltyPercent}\n`);
    if (result.artifactsWritten) {
      process.stdout.write('\nArtifacts written to:\n');
      process.stdout.write(`  StateInit BOC: ${result.artifacts.stateInitPath}\n`);
      process.stdout.write(`  Code BOC:      ${result.artifacts.codePath}\n`);
      process.stdout.write(`  Data BOC:      ${result.artifacts.dataPath}\n`);
    } else {
      process.stdout.write('\nArtifacts were not written (--no-artifacts supplied).\n');
    }
    process.stdout.write('\n');
  }
}

main().catch((error) => {
  process.stderr.write(`Error: ${error.message}\n`);
  if (process.env.DEBUG || cliArgs.includes('--debug')) {
    console.error(error);
  }
  process.exit(1);
});
