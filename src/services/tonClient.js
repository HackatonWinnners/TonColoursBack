import TonWeb from 'tonweb';
import { mnemonicToPrivateKey } from '@ton/crypto';
import {
  WalletContractV1R1,
  WalletContractV1R2,
  WalletContractV1R3,
  WalletContractV2R1,
  WalletContractV2R2,
  WalletContractV3R1,
  WalletContractV3R2,
  WalletContractV4,
  WalletContractV5R1,
} from '@ton/ton';
import config from '../config/env.js';

const providerOptions = config.tonApiKey ? { apiKey: config.tonApiKey } : undefined;
const provider = new TonWeb.HttpProvider(config.tonEndpoint, providerOptions);
const tonweb = new TonWeb(provider);

const walletFactories = new Map([
  ['v1r1', WalletContractV1R1],
  ['v1r2', WalletContractV1R2],
  ['v1r3', WalletContractV1R3],
  ['v2r1', WalletContractV2R1],
  ['v2r2', WalletContractV2R2],
  ['v3r1', WalletContractV3R1],
  ['v3r2', WalletContractV3R2],
  ['v4', WalletContractV4],
  ['v5r1', WalletContractV5R1],
]);

let cachedKeyPairPromise;
let cachedWalletContract;

function resolveWalletFactory(version) {
  const factory = walletFactories.get(version);
  if (!factory) {
    throw new Error(`Wallet contract for version "${version}" is not available`);
  }
  return factory;
}

async function getKeyPair() {
  if (!cachedKeyPairPromise) {
    cachedKeyPairPromise = mnemonicToPrivateKey(config.mnemonicWords);
  }
  return cachedKeyPairPromise;
}

async function getWalletContract() {
  if (cachedWalletContract) {
    return cachedWalletContract;
  }
  const keyPair = await getKeyPair();
  const WalletClass = resolveWalletFactory(config.walletVersion);
  
  const createOptions = {
    workchain: 0,
    publicKey: keyPair.publicKey,
  };
  
  // For v5r1 wallets, we need to specify the walletId to match the expected address
  if (config.walletVersion === 'v5r1') {
    createOptions.walletId = {
      networkGlobalId: -3, // Testnet
      workChain: 0,
      subwalletNumber: 0,
      walletVersion: 'v5',
    };
  }
  
  cachedWalletContract = WalletClass.create(createOptions);
  return cachedWalletContract;
}

export async function getMinterWallet() {
  const walletContract = await getWalletContract();
  const keyPair = await getKeyPair();
  const address = walletContract.address;

  const walletAdapter = {
    address,
    async getAddress() {
      return address;
    },
  };

  return {
    wallet: walletAdapter,
    keyPair,
    walletContract,
  };
}

export function getTonWeb() {
  return tonweb;
}

export default {
  getTonWeb,
  getMinterWallet,
};
