import { spawn } from 'node:child_process';
import path from 'node:path';
import config from '../config/env.js';
import { buildMetadataUri } from './metadataService.js';
import { normalizeHexColor } from '../utils/color.js';
import { getMinterWallet, getTonWeb } from './tonClient.js';

const RESULT_PREFIX = 'MINT_RESULT=';
const SCRIPT_CWD = path.resolve(process.cwd(), 'the-path-season-1-nft');
const SCRIPT_COMMAND = process.env.NFT_ITEM_MINT_COMMAND ?? 'npx';

const DEFAULT_TONCENTER_ENDPOINTS = {
  mainnet: 'https://toncenter.com/api/v2/jsonRPC',
  testnet: 'https://testnet.toncenter.com/api/v2/jsonRPC',
};

function buildScriptArgs() {
  const args = ['blueprint', 'run'];
  const networkFlag = config.tonNetwork === 'testnet' ? '--testnet' : '--mainnet';
  args.push(networkFlag);

  const expectedDefaultEndpoint = DEFAULT_TONCENTER_ENDPOINTS[config.tonNetwork];
  const endpointMatchesDefault = expectedDefaultEndpoint && config.tonEndpoint === expectedDefaultEndpoint;

  if (!endpointMatchesDefault) {
    args.push('--custom', config.tonEndpoint);
    args.push('--custom-type', config.tonNetwork);
    args.push('--custom-version', 'v2');
    if (config.tonApiKey) {
      args.push('--custom-key', config.tonApiKey);
    }
  }

  // Use --tonconnect to bypass wallet selection prompts
  // This will make provider.sender() unavailable, forcing automation mode
  args.push('--tonconnect');
  args.push('deployNftItem');
  return args;
}

let mintQueue = Promise.resolve();

class MintPreconditionError extends Error {
  constructor(message, { code = 'MINT_PRECONDITION_FAILED', statusCode = 503, details } = {}) {
    super(message);
    this.name = 'MintPreconditionError';
    this.code = code;
    this.statusCode = statusCode;
    if (details) {
      this.details = details;
    }
  }
}

function formatWalletAddress(address, { bounceable = true, testOnly = config.tonNetwork !== 'mainnet' } = {}) {
  if (typeof address === 'string') {
    return address;
  }

  if (!address || typeof address.toString !== 'function') {
    throw new MintPreconditionError('Unable to derive minter wallet address representation', {
      code: 'MINTER_WALLET_ADDRESS_FORMAT',
      statusCode: 500,
    });
  }

  const urlSafe = true;
  const options = { bounceable, urlSafe, testOnly };
  let lastError;

  try {
    return address.toString(options);
  } catch (error) {
    lastError = error;
  }

  try {
    return address.toString(bounceable, urlSafe, testOnly);
  } catch (error) {
    lastError = error;
  }

  try {
    return address.toString();
  } catch (error) {
    lastError = error;
  }

  throw new MintPreconditionError('Failed to format minter wallet address', {
    code: 'MINTER_WALLET_ADDRESS_FORMAT',
    statusCode: 500,
    details: {
      cause: lastError?.message ?? String(lastError),
    },
  });
}

async function resolveMinterWalletStatus() {
  const { wallet } = await getMinterWallet();
  const tonweb = getTonWeb();
  const walletAddress = await wallet.getAddress();
  const testOnly = config.tonNetwork !== 'mainnet';
  const friendlyAddress = formatWalletAddress(walletAddress, { bounceable: true, testOnly });
  const nonBounceableAddress = formatWalletAddress(walletAddress, { bounceable: false, testOnly });

  try {
    const info = await tonweb.provider.getAddressInfo(friendlyAddress);
    const balanceNano = info?.balance ? BigInt(info.balance) : 0n;
    const state = info?.state ?? 'unknown';
    return {
      friendlyAddress,
      nonBounceableAddress,
      balanceNano,
      state,
    };
  } catch (error) {
    throw new MintPreconditionError('Failed to query minter wallet status from TON RPC', {
      code: 'MINTER_WALLET_STATUS_UNAVAILABLE',
      statusCode: 502,
      details: {
        cause: error?.message ?? String(error),
        walletAddress: friendlyAddress,
        walletAddressNonBounceable: nonBounceableAddress,
      },
    });
  }
}

function toNano(valueTon) {
  const scaled = Math.round(Number(valueTon) * 1e9);
  if (Number.isNaN(scaled) || scaled < 0) {
    throw new MintPreconditionError(`Invalid TON amount configured: ${valueTon}`, {
      code: 'INVALID_TON_AMOUNT',
      statusCode: 500,
    });
  }
  return BigInt(scaled);
}

async function ensureMinterWalletReady() {
  const {
    friendlyAddress,
    nonBounceableAddress,
    balanceNano,
    state,
  } = await resolveMinterWalletStatus();

  const requiredTransfer = toNano(config.collectionMintValueTon);
  const safetyBuffer = toNano(Math.max(config.collectionMintValueTon * 0.1, 0.02));
  const requiredBalance = requiredTransfer + safetyBuffer;

  const warnings = [];

  if (balanceNano < requiredBalance) {
    const missingTon = Number(requiredBalance - balanceNano) / 1e9;
    warnings.push(
      `Balance ${Number(balanceNano) / 1e9} TON may be insufficient (needs ${Number(requiredBalance) / 1e9}). Missing ${missingTon.toFixed(3)} TON.`
    );
  }

  if (state !== 'active' && state !== 'uninitialized') {
    warnings.push(`Wallet state is "${state}"; expected active or uninitialized.`);
  }

  if (warnings.length > 0) {
    console.warn('[mintService] Minter wallet precheck warnings:', {
      walletAddress: friendlyAddress,
      walletAddressNonBounceable: nonBounceableAddress,
      balanceTon: Number(balanceNano) / 1e9,
      requiredTon: Number(requiredBalance) / 1e9,
      state,
      warnings,
    });
  }

  return {
    friendlyAddress,
    nonBounceableAddress,
    balanceNano,
    state,
    warnings,
  };
}

function enqueueMint(task) {
  const next = mintQueue.then(task, task);
  mintQueue = next.then(() => undefined, () => undefined);
  return next;
}

function parseMintResult(stdout) {
  const lines = stdout.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  for (let i = lines.length - 1; i >= 0; i -= 1) {
    const line = lines[i];
    if (line.startsWith(RESULT_PREFIX)) {
      const payload = line.slice(RESULT_PREFIX.length);
      try {
        return JSON.parse(payload);
      } catch (error) {
        throw new Error('Mint script produced an invalid JSON payload');
      }
    }
  }
  throw new Error('Mint script did not produce a result payload');
}

async function runDeployScript({ walletAddress, color, telegramUserId }) {
  const env = {
    ...process.env,
    TON_COLOURS_AUTOMATION: 'true',
    TON_COLOURS_COLLECTION_ADDRESS: config.collectionAddress,
    TON_COLOURS_ITEM_OWNER: walletAddress,
    TON_COLOURS_ITEM_COLOR: color,
    TON_COLOURS_ITEM_TELEGRAM_ID: String(telegramUserId),
    TON_WALLET_MNEMONIC: config.mnemonicWords.join(' '),
    TON_WALLET_VERSION: config.walletVersion,
    TON_NETWORK: config.tonNetwork,
    TON_ENDPOINT: config.tonEndpoint,
  };

  const child = spawn(SCRIPT_COMMAND, [...buildScriptArgs(), config.collectionAddress], {
    cwd: SCRIPT_CWD,
    env,
    stdio: ['ignore', 'pipe', 'pipe'], // ignore stdin since we don't need it
  });

  let stdout = '';
  let stderr = '';

  child.stdout.on('data', (chunk) => {
    stdout += chunk.toString();
  });

  child.stderr.on('data', (chunk) => {
    stderr += chunk.toString();
  });

  const exitState = await new Promise((resolve) => {
    child.on('close', (code, signal) => resolve({ code, signal }));
  });

  if (exitState.code !== 0) {
    const reason = exitState.code === null ? `signal ${exitState.signal}` : `code ${exitState.code}`;
    const error = new Error(`Mint script exited abnormally (${reason})`);
    error.stdout = stdout;
    error.stderr = stderr;
    throw error;
  }

  const parsed = parseMintResult(stdout);
  return { result: parsed, stdout, stderr };
}

export async function mintColorNft({ walletAddress, telegramUserId, color }) {
  return enqueueMint(async () => {
    await ensureMinterWalletReady();
    const normalizedColor = normalizeHexColor(color);
    const normalizedWallet = walletAddress;

    const { result, stdout, stderr } = await runDeployScript({
      walletAddress: normalizedWallet,
      color: normalizedColor,
      telegramUserId,
    });

    if (typeof result.itemIndex !== 'number' || Number.isNaN(result.itemIndex)) {
      const error = new Error('Mint script result is missing a numeric itemIndex');
      error.result = result;
      error.stdout = stdout;
      error.stderr = stderr;
      throw error;
    }

    const itemIndex = result.itemIndex;
    const mintedAt = typeof result.mintedAt === 'string' ? result.mintedAt : new Date().toISOString();
    const metadataUri = buildMetadataUri({
      baseUrl: config.backendBaseUrl,
      itemIndex,
      color: normalizedColor,
      walletAddress: normalizedWallet,
      telegramUserId,
      mintedAt,
    });

    return {
      itemIndex,
      metadataUri,
      transaction: null,
      nftAddress: typeof result.nftAddress === 'string' ? result.nftAddress : null,
      color: normalizedColor,
      ownerAddress: normalizedWallet,
      mintedAt,
      scriptMetadataUri: result.metadataUri ?? null,
      itemContent: result.itemContent ?? null,
    };
  });
}

export default {
  mintColorNft,
};
