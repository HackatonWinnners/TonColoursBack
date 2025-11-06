import { Address, Cell, internal, SendMode } from '@ton/core';
import { NftCollection } from '../wrappers/NftCollection';
import { NetworkProvider, sleep } from '@ton/blueprint';
import { promises as fs } from 'fs';
import path from 'path';
import { mnemonicToPrivateKey } from '@ton/crypto';
import { WalletContractV5R1, TonClient, Sender, SenderArguments } from '@ton/ton';

const RESULT_PREFIX = 'MINT_RESULT=';
const DEFAULT_METADATA_FILE = path.resolve(__dirname, '../metadata/item-meta.json');

function readEnv(key: string): string | undefined {
    const value = process.env[key];
    if (!value) {
        return undefined;
    }
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
}

function resolveMetadataFile(): string {
    const overridePath = readEnv('TON_COLOURS_METADATA_FILE');
    if (overridePath) {
        return path.isAbsolute(overridePath) ? overridePath : path.resolve(process.cwd(), overridePath);
    }
    return DEFAULT_METADATA_FILE;
}

function createColourSvg(hexColour: string): string {
    const colourWithHash = `#${hexColour}`;
    return [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512" shape-rendering="geometricPrecision">',
        `  <rect width="512" height="512" fill="${colourWithHash}"/>`,
        '</svg>',
    ].join('\n');
}

async function updateItemMetadata(
    colour: string,
    owner: Address,
    telegramUserId: number,
    metadataFile: string,
    mintedAt: string,
) {
    const svg = createColourSvg(colour);
    const svgBase64 = Buffer.from(svg, 'utf8').toString('base64');
    let template: Record<string, any> = {};

    try {
        const raw = await fs.readFile(metadataFile, 'utf8');
        template = JSON.parse(raw);
    } catch (error) {
        // File might not exist yet; we'll create a fresh one below.
    }

    const colourWithHash = `#${colour}`;
    const defaultDescription = 'A unique TON Colours NFT minted via @TonColoursBot.';
    const description =
        typeof template.description === 'string' && template.description.trim().length > 0
            ? template.description.trim()
            : defaultDescription;

    const reservedTraits = new Set(['Color', 'Telegram User ID', 'Owner Address', 'Minted At']);
    const preservedAttributes = Array.isArray(template.attributes)
        ? template.attributes.filter((attribute: any) => attribute && !reservedTraits.has(attribute.trait_type))
        : [];

    const propertiesTemplate =
        template.properties && typeof template.properties === 'object' ? template.properties : {};

    const metadata = {
        ...template,
        name: `TON Colour ${colourWithHash}`,
        description,
        external_url: template.external_url ?? 'https://t.me/TonColoursBot',
        image: `data:image/svg+xml;base64,${svgBase64}`,
        image_mime_type: 'image/svg+xml',
        compiler: template.compiler ?? 'TON Colours Blueprint',
        attributes: [
            ...preservedAttributes,
            { trait_type: 'Color', value: colourWithHash },
            { trait_type: 'Telegram User ID', value: String(telegramUserId) },
            { trait_type: 'Owner Address', value: owner.toString() },
            { trait_type: 'Minted At', value: mintedAt },
        ],
        properties: {
            ...propertiesTemplate,
            color: colourWithHash,
            telegramUserId,
            ownerAddress: owner.toString(),
            mintedAt,
            imageSource: 'inline-svg',
        },
    };

    await fs.mkdir(path.dirname(metadataFile), { recursive: true });
    await fs.writeFile(metadataFile, `${JSON.stringify(metadata, null, 4)}\n`, 'utf8');
    return { svgDataUri: metadata.image, metadataPath: metadataFile, metadata };
}

function normalizeHexColour(input: string): string {
    const trimmed = input.trim();
    const withoutHash = trimmed.startsWith('#') ? trimmed.slice(1) : trimmed;
    const upper = withoutHash.toUpperCase();

    if (!/^[0-9A-F]{6}$/.test(upper)) {
        throw new Error('HEX colour must be a 6-character value like #FFAA33');
    }

    return upper;
}

function parseTelegramUserId(input: string): number {
    const trimmed = input.trim();

    if (trimmed.length === 0) {
        throw new Error('Telegram user identifier is required');
    }

    const parsed = Number.parseInt(trimmed, 10);
    if (!Number.isFinite(parsed) || parsed < 0) {
        throw new Error('Telegram user identifier must be a non-negative integer');
    }

    return parsed;
}

async function runAutomated(ui: any, args: string[]) {
    // Get wallet configuration from environment
    const mnemonicString = process.env.TON_WALLET_MNEMONIC;
    const network = process.env.TON_NETWORK || 'testnet';
    const endpoint = process.env.TON_ENDPOINT || 'https://testnet.toncenter.com/api/v2/jsonRPC';
    
    if (!mnemonicString) {
        throw new Error('TON_WALLET_MNEMONIC environment variable is required');
    }
    
    // Create wallet with proper walletId for v5r1
    const mnemonicArray = mnemonicString.split(' ');
    const keyPair = await mnemonicToPrivateKey(mnemonicArray);
    
    const wallet = WalletContractV5R1.create({
        publicKey: keyPair.publicKey,
        walletId: {
            networkGlobalId: network === 'testnet' ? -3 : -239,
            context: {
                walletVersion: 'v5r1',
                workchain: 0,
                subwalletNumber: 0,
            }
        }
    });
    
    // Create TonClient and open wallet contract
    const tonClient = new TonClient({ endpoint });
    const walletContract = tonClient.open(wallet);
    const walletAddress = wallet.address;
    
    ui.write(`Using wallet at address: ${walletAddress.toString()}`);
    
    // Create custom sender
    const sender: Sender = {
        address: walletAddress,
        async send(args: SenderArguments) {
            await walletContract.sendTransfer({
                seqno: await walletContract.getSeqno(),
                secretKey: keyPair.secretKey,
                sendMode: SendMode.PAY_GAS_SEPARATELY,
                messages: [
                    internal({
                        to: args.to,
                        value: args.value,
                        body: args.body,
                        init: args.init,
                        bounce: args.bounce,
                    })
                ],
            });
        }
    };

    const envCollection = readEnv('TON_COLOURS_COLLECTION_ADDRESS');
    const envOwner = readEnv('TON_COLOURS_ITEM_OWNER');
    const envColour = readEnv('TON_COLOURS_ITEM_COLOR');
    const envTelegram = readEnv('TON_COLOURS_ITEM_TELEGRAM_ID');

    const collectionInput = envCollection ?? (args.length > 0 ? args[0] : '');
    if (!collectionInput) {
        throw new Error('Collection address is required');
    }
    
    const address = Address.parse(collectionInput.trim());

    const collection = tonClient.open(NftCollection.createFromAddress(address));
    const collectionData = await collection.getCollectionData();

    const ownerInput = envOwner ?? '';
    if (!ownerInput) {
        throw new Error('Item owner address is required');
    }
    const itemOwner = Address.parse(ownerInput.trim());

    const colourInput = envColour ?? '';
    if (!colourInput) {
        throw new Error('Color is required');
    }
    const colour = normalizeHexColour(colourInput);

    const telegramInput = envTelegram ?? '';
    if (!telegramInput) {
        throw new Error('Telegram user ID is required');
    }
    const telegramUserId = parseTelegramUserId(telegramInput);

    const metadataFile = resolveMetadataFile();
    const mintedAt = new Date().toISOString();
    const { metadataPath } = await updateItemMetadata(colour, itemOwner, telegramUserId, metadataFile, mintedAt);

    const collectionBaseUrl = collectionData.collectionContent;

    const ownerForUri = encodeURIComponent(itemOwner.toString());
    const itemIndex = collectionData.nextItemId;
    const colourWithHash = `#${colour}`;
    const itemContent = `${itemIndex}?color=${colour}&wallet=${ownerForUri}&tg=${telegramUserId}`;

    await collection.sendDeployNewNft(sender, {
        itemIndex,
        itemOwnerAddress: itemOwner,
        itemContent,
    });

    ui.write(`Submitted mint for colour ${colourWithHash}`);
    ui.write(`Metadata updated at: ${metadataPath}`);
    ui.write(`Item content path: ${itemContent}`);
    ui.write('Waiting for deploy...');

    let dataAfter = await collection.getCollectionData();
    let attempt = 1;
    while (dataAfter.nextItemId === collectionData.nextItemId) {
        ui.setActionPrompt(`Attempt ${attempt}`);
        await sleep(2000);
        dataAfter = await collection.getCollectionData();
        attempt++;
    }

    ui.clearActionPrompt();
    const nftAddress = await collection.getNftAddressByIndex(itemIndex);
    let metadataUri: string;
    try {
        metadataUri = new URL(itemContent, collectionBaseUrl).toString();
    } catch (_error) {
        metadataUri = itemContent;
    }

    ui.write('Item deployed successfully!');
    ui.write(`Next item index is now ${dataAfter.nextItemId}`);
    ui.write(`Minted item address: ${nftAddress.toString()}`);
    ui.write(`Metadata URI: ${metadataUri}`);

    const mintResult = {
        collectionAddress: address.toString(),
        itemIndex,
        ownerAddress: itemOwner.toString(),
        colour: colourWithHash,
        telegramUserId,
        itemContent,
        metadataPath,
        metadataUri,
        nftAddress: nftAddress.toString(),
        attempts: attempt,
        timestamp: new Date().toISOString(),
        mintedAt,
    };

    console.log(`${RESULT_PREFIX}${JSON.stringify(mintResult)}`);
}

export async function run(provider: NetworkProvider, args: string[]) {
    // Check if we're in automation mode - if so, bypass provider entirely
    const isAutomation = process.env.TON_COLOURS_AUTOMATION === 'true';
    
    if (isAutomation) {
        // Run in automation mode without using provider.sender()
        await runAutomated(provider.ui(), args);
        return;
    }
    
    // Normal interactive mode
    const ui = provider.ui();
    
    // Try to get sender - if this fails, we're probably in --tonconnect mode without a wallet
    let sender;
    try {
        sender = provider.sender();
    } catch (error) {
        // If sender is not available and we have automation env vars, use automation mode
        if (process.env.TON_WALLET_MNEMONIC) {
            await runAutomated(ui, args);
            return;
        }
        throw error;
    }

    const envCollection = readEnv('TON_COLOURS_COLLECTION_ADDRESS');
    const envOwner = readEnv('TON_COLOURS_ITEM_OWNER');
    const envColour = readEnv('TON_COLOURS_ITEM_COLOR');
    const envTelegram = readEnv('TON_COLOURS_ITEM_TELEGRAM_ID');

    const collectionInput = envCollection ?? (args.length > 0 ? args[0] : await ui.input('Collection address'));
    const address = Address.parse(collectionInput.trim());

    if (!(await provider.isContractDeployed(address))) {
        ui.write(`Error: Contract at address ${address} is not deployed!`);
        return;
    }

    const collection = provider.open(NftCollection.createFromAddress(address));
    const collectionData = await collection.getCollectionData();

    const ownerInput = envOwner ?? (args.length > 3 ? args[3] : await ui.input('New item owner address'));
    const itemOwner = Address.parse(ownerInput.trim());

    const colourInput = envColour ?? (args.length > 1 ? args[1] : await ui.input('HEX colour (e.g. #FFAA33)'));
    const colour = normalizeHexColour(colourInput);

    const telegramInput = envTelegram ?? (args.length > 2 ? args[2] : await ui.input('Telegram user identifier'));
    const telegramUserId = parseTelegramUserId(telegramInput);

    const metadataFile = resolveMetadataFile();
    const mintedAt = new Date().toISOString();
    const { metadataPath } = await updateItemMetadata(colour, itemOwner, telegramUserId, metadataFile, mintedAt);

    const collectionBaseUrl = collectionData.collectionContent;

    const ownerForUri = encodeURIComponent(itemOwner.toString());
    const itemIndex = collectionData.nextItemId;
    const colourWithHash = `#${colour}`;
    const itemContent = `${itemIndex}?color=${colour}&wallet=${ownerForUri}&tg=${telegramUserId}`;

    await collection.sendDeployNewNft(sender, {
        itemIndex,
        itemOwnerAddress: itemOwner,
        itemContent,
    });

    ui.write(`Submitted mint for colour ${colourWithHash}`);
    ui.write(`Metadata updated at: ${metadataPath}`);
    ui.write(`Item content path: ${itemContent}`);
    ui.write('Waiting for deploy...');

    let dataAfter = await collection.getCollectionData();
    let attempt = 1;
    while (dataAfter.nextItemId === collectionData.nextItemId) {
        ui.setActionPrompt(`Attempt ${attempt}`);
        await sleep(2000);
        dataAfter = await collection.getCollectionData();
        attempt++;
    }

    ui.clearActionPrompt();
    const nftAddress = await collection.getNftAddressByIndex(itemIndex);
    let metadataUri: string;
    try {
        metadataUri = new URL(itemContent, collectionBaseUrl).toString();
    } catch (_error) {
        metadataUri = itemContent;
    }

    ui.write('Item deployed successfully!');
    ui.write(`Next item index is now ${dataAfter.nextItemId}`);
    ui.write(`Minted item address: ${nftAddress.toString()}`);
    ui.write(`Metadata URI: ${metadataUri}`);

    const mintResult = {
        collectionAddress: address.toString(),
        itemIndex,
        ownerAddress: itemOwner.toString(),
        colour: colourWithHash,
        telegramUserId,
        itemContent,
        metadataPath,
        metadataUri,
        nftAddress: nftAddress.toString(),
        attempts: attempt,
        timestamp: new Date().toISOString(),
        mintedAt,
    };

    console.log(`${RESULT_PREFIX}${JSON.stringify(mintResult)}`);
}
