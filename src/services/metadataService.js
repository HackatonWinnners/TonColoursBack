import { buildColorSvg } from './svgGenerator.js';
import { normalizeHexColor } from '../utils/color.js';
import config from '../config/env.js';
import { isMinioConfigured, getColorSvgUrl } from './minioStorage.js';

function toBase64(input) {
  return Buffer.from(input, 'utf8').toString('base64');
}

export function buildMetadata({
  itemIndex,
  color,
  walletAddress,
  telegramUserId,
  mintedAt,
  minioUrl, // Optional: pre-uploaded MinIO URL
}) {
  const normalizedColor = normalizeHexColor(color);
  
  // Generate SVG and encode as base64 for GetGems compatibility (fallback)
  const svg = buildColorSvg(normalizedColor);
  const base64Svg = toBase64(svg);
  
  // Determine best image URL:
  // 1. Use provided MinIO URL (if uploaded during minting)
  // 2. Use MinIO URL pattern (if configured)
  // 3. Fall back to backend endpoint
  let imageUrl;
  if (minioUrl) {
    imageUrl = minioUrl;
  } else if (isMinioConfigured()) {
    imageUrl = getColorSvgUrl(normalizedColor);
  } else {
    const url = new URL(`${config.backendBaseUrl}/image/${itemIndex}`);
    url.searchParams.set('color', normalizedColor.replace('#', ''));
    imageUrl = url.toString();
  }
  
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
    image: imageUrl,
    image_data: base64Svg, // Base64-encoded SVG for direct embedding (fallback)
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
