const HEX_COLOR_REGEX = /^#?(?:[0-9a-fA-F]{6})$/;

export function normalizeHexColor(input) {
  if (typeof input !== 'string') {
    throw new Error('Color value must be a string');
  }
  const trimmed = input.trim();
  if (!HEX_COLOR_REGEX.test(trimmed)) {
    throw new Error(`Invalid hex color: "${input}"`);
  }
  const hex = trimmed.startsWith('#') ? trimmed.slice(1) : trimmed;
  return `#${hex.toUpperCase()}`;
}

export function hexToRgb(hexColor) {
  const normalized = normalizeHexColor(hexColor);
  const hex = normalized.slice(1);
  const bigint = Number.parseInt(hex, 16);
  const r = (bigint >> 16) & 255;
  const g = (bigint >> 8) & 255;
  const b = bigint & 255;
  return { r, g, b };
}

export function isDarkColor(hexColor) {
  const { r, g, b } = hexToRgb(hexColor);
  const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return luminance < 140;
}

export default {
  normalizeHexColor,
  hexToRgb,
  isDarkColor,
};
