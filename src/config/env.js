import dotenv from 'dotenv';

const DEFAULT_TEST_MNEMONIC = Array(24).fill('abandon').join(' ');
const DEFAULT_TEST_COLLECTION_ADDRESS = 'EQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAM9c';

dotenv.config();

const rawPort = process.env.PORT ?? '3000';
const port = Number.parseInt(rawPort, 10);
if (Number.isNaN(port) || port <= 0) {
  throw new Error(`PORT must be a positive integer, received "${rawPort}"`);
}

const tonEndpoint = (process.env.TON_HTTP_ENDPOINT ?? 'https://toncenter.com/api/v2/jsonRPC').trim();
if (!tonEndpoint) {
  throw new Error('TON_HTTP_ENDPOINT cannot be empty');
}

const tonApiKey = process.env.TON_API_KEY ? process.env.TON_API_KEY.trim() : undefined;

const rawMnemonic = (process.env.MINT_WALLET_MNEMONIC?.trim() ?? (process.env.NODE_ENV === 'test' ? DEFAULT_TEST_MNEMONIC : ''));
if (!rawMnemonic) {
  throw new Error('MINT_WALLET_MNEMONIC is required');
}

const mnemonicWords = rawMnemonic.split(/\s+/).filter(Boolean);
if (mnemonicWords.length !== 24) {
  throw new Error('MINT_WALLET_MNEMONIC must contain exactly 24 words');
}

const rawCollectionAddress = (process.env.NFT_COLLECTION_ADDRESS?.trim() ?? (process.env.NODE_ENV === 'test' ? DEFAULT_TEST_COLLECTION_ADDRESS : ''));
if (!rawCollectionAddress) {
  throw new Error('NFT_COLLECTION_ADDRESS is required');
}

const rawNetwork = process.env.TON_NETWORK?.trim().toLowerCase();
const tonNetwork = rawNetwork === 'testnet' || rawNetwork === 'mainnet'
  ? rawNetwork
  : /testnet/i.test(tonEndpoint) ? 'testnet' : 'mainnet';

const WALLET_VERSION_ALIASES = new Map([
  ['v4r1', 'v4'],
  ['v4r2', 'v4'],
  ['v4r3', 'v4'],
]);

const SUPPORTED_WALLET_VERSIONS = new Set([
  'v1r1',
  'v1r2',
  'v1r3',
  'v2r1',
  'v2r2',
  'v3r1',
  'v3r2',
  'v4',
  'v5r1',
]);

function normalizeWalletVersion(value) {
  const fallback = 'v4';
  if (!value) {
    return fallback;
  }
  const lower = value.trim().toLowerCase();
  const mapped = WALLET_VERSION_ALIASES.get(lower) ?? lower;
  if (!SUPPORTED_WALLET_VERSIONS.has(mapped)) {
    throw new Error(`Unsupported TON wallet version "${value}". Expected one of: ${Array.from(SUPPORTED_WALLET_VERSIONS).join(', ')}`);
  }
  return mapped;
}

const normalizeTonAmount = (value, fallback) => {
  const source = (value ?? fallback).trim();
  const parsed = Number.parseFloat(source);
  if (Number.isNaN(parsed) || parsed <= 0) {
    throw new Error(`Invalid TON amount: "${source}"`);
  }
  return parsed;
};

const itemDeployAmountTon = normalizeTonAmount(process.env.NFT_ITEM_DEPLOY_AMOUNT_TON, '0.002');
const collectionMintValueTon = normalizeTonAmount(process.env.NFT_COLLECTION_MINT_VALUE_TON, '0.009');

if (collectionMintValueTon < itemDeployAmountTon) {
  throw new Error('NFT_COLLECTION_MINT_VALUE_TON must be greater than or equal to NFT_ITEM_DEPLOY_AMOUNT_TON');
}

const backendBaseUrlRaw = (process.env.BACKEND_PUBLIC_BASE_URL ?? `http://localhost:${port}`).trim();
if (!backendBaseUrlRaw) {
  throw new Error('BACKEND_PUBLIC_BASE_URL cannot be empty');
}

const backendBaseUrl = backendBaseUrlRaw.replace(/\/$/, '');

function normalizeWebhookPathInput(value, fallback = '/telegram/webhook') {
  const raw = value && value.trim() ? value.trim() : fallback;
  const prefixed = raw.startsWith('/') ? raw : `/${raw}`;
  const trimmedTrailing = prefixed.replace(/\/+$/, '');
  return trimmedTrailing.length > 0 ? trimmedTrailing : fallback;
}

const telegramBotToken = process.env.TELEGRAM_BOT_TOKEN?.trim();
const telegramWebhookPath = normalizeWebhookPathInput(process.env.TELEGRAM_WEBHOOK_PATH);
const telegramSecretToken = process.env.TELEGRAM_WEBHOOK_SECRET?.trim();
const telegramWebhookSet = (process.env.TELEGRAM_SET_WEBHOOK ?? '').toLowerCase();

const telegram = telegramBotToken
  ? {
      enabled: true,
      botToken: telegramBotToken,
      apiBaseUrl: `https://api.telegram.org/bot${telegramBotToken}`,
      webhookPath: telegramWebhookPath,
      secretToken: telegramSecretToken ?? undefined,
      autoSetWebhook: telegramWebhookSet === 'true' || telegramWebhookSet === '1',
    }
  : {
      enabled: false,
    };

const walletVersion = normalizeWalletVersion(process.env.MINT_WALLET_VERSION);

// MinIO Configuration (S3-compatible object storage)
const minioEndpoint = process.env.MINIO_ENDPOINT?.trim(); // e.g., http://localhost:9000
const minioAccessKey = process.env.MINIO_ACCESS_KEY?.trim();
const minioSecretKey = process.env.MINIO_SECRET_KEY?.trim();
const minioBucket = process.env.MINIO_BUCKET?.trim() || 'ton-colours';
const minioRegion = process.env.MINIO_REGION?.trim() || 'us-east-1';
const minioPublicUrl = process.env.MINIO_PUBLIC_URL?.trim(); // Optional: public URL (CDN, ngrok, etc.)

export const config = {
  port,
  tonEndpoint,
  tonApiKey,
  tonNetwork,
  mnemonicWords,
  collectionAddress: rawCollectionAddress,
  itemDeployAmountTon,
  collectionMintValueTon,
  backendBaseUrl,
  telegram,
  walletVersion,
  // MinIO
  minioEndpoint,
  minioAccessKey,
  minioSecretKey,
  minioBucket,
  minioRegion,
  minioPublicUrl,
};

export default config;
