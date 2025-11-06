import { buildColorSvg } from './svgGenerator.js';
import { normalizeHexColor } from '../utils/color.js';

function toBase64(input) {
  return Buffer.from(input, 'utf8').toString('base64');
}

export function buildMetadata({
  itemIndex,
  color,
  walletAddress,
  telegramUserId,
  mintedAt,
}) {
  const normalizedColor = normalizeHexColor(color);
  const svg = buildColorSvg(normalizedColor);
  const svgBase64 = toBase64(svg);
  const attributes = [
    { trait_type: 'Color', value: normalizedColor },
  ];

  if (telegramUserId) {
    attributes.push({ trait_type: 'Telegram User ID', value: String(telegramUserId) });
  }

  if (walletAddress) {
    attributes.push({ trait_type: 'Wallet Address', value: walletAddress });
  }

  if (mintedAt) {
    attributes.push({ trait_type: 'Minted At', value: new Date(mintedAt).toISOString() });
  }

  return {
    name: `TON Colour ${normalizedColor}`,
    description: 'A unique on-chain colour minted on The Open Network for Telegram mini app users.',
    image: `data:image/svg+xml;base64,${svgBase64}`,
    image_data: svg,
    attributes,
    background_color: normalizedColor.replace('#', ''),
    external_url: 'https://ton.org/',
    properties: {
      color: normalizedColor,
      walletAddress: walletAddress ?? null,
      telegramUserId: telegramUserId ?? null,
    },
  };
}

export function buildMetadataUri({ baseUrl, itemIndex, color, walletAddress, telegramUserId, mintedAt }) {
  const normalizedColor = normalizeHexColor(color);
  const url = new URL(`${baseUrl}/metadata/${itemIndex}`);
  url.searchParams.set('color', normalizedColor.replace('#', ''));
  if (walletAddress) {
    url.searchParams.set('wallet', walletAddress);
  }
  if (telegramUserId !== undefined && telegramUserId !== null) {
    url.searchParams.set('tg', String(telegramUserId));
  }
  if (mintedAt) {
    url.searchParams.set('mintedAt', String(mintedAt));
  }
  return url.toString();
}

export default {
  buildMetadata,
  buildMetadataUri,
};
