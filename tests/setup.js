import process from 'node:process';

process.env.NODE_ENV = 'test';
process.env.PORT = process.env.PORT ?? '3001';
process.env.TON_HTTP_ENDPOINT = process.env.TON_HTTP_ENDPOINT ?? 'https://testnet.toncenter.com/api/v2/jsonRPC';
process.env.TON_NETWORK = process.env.TON_NETWORK ?? 'testnet';
process.env.MINT_WALLET_MNEMONIC = process.env.MINT_WALLET_MNEMONIC ?? Array(24).fill('abandon').join(' ');
process.env.NFT_COLLECTION_ADDRESS = process.env.NFT_COLLECTION_ADDRESS ?? 'EQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAM9c';
process.env.BACKEND_PUBLIC_BASE_URL = process.env.BACKEND_PUBLIC_BASE_URL ?? 'http://localhost:3000';
process.env.NFT_ITEM_DEPLOY_AMOUNT_TON = process.env.NFT_ITEM_DEPLOY_AMOUNT_TON ?? '0.002';
process.env.NFT_COLLECTION_MINT_VALUE_TON = process.env.NFT_COLLECTION_MINT_VALUE_TON ?? '0.009';
