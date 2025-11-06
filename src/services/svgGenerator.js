import { normalizeHexColor } from '../utils/color.js';

const SVG_SIZE = 512;

export function buildColorSvg(color) {
  const normalized = normalizeHexColor(color);

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<svg xmlns="http://www.w3.org/2000/svg" width="${SVG_SIZE}" height="${SVG_SIZE}" viewBox="0 0 ${SVG_SIZE} ${SVG_SIZE}" shape-rendering="geometricPrecision">`,
    `  <rect width="${SVG_SIZE}" height="${SVG_SIZE}" fill="${normalized}" />`,
    '</svg>',
  ].join('\n');
}

export default { buildColorSvg };
