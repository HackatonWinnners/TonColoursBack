import { describe, expect, it } from 'vitest';
import { buildColorSvg } from '../src/services/svgGenerator.js';

describe('buildColorSvg', () => {
  it('renders svg with coloured square', () => {
    const svg = buildColorSvg('#123456');
    expect(svg).toContain('<?xml');
    expect(svg).toContain('<rect');
    expect(svg).toContain('#123456');
    expect(svg).not.toContain('TON Colours');
  });
});
