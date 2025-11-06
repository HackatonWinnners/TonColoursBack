import { describe, expect, it } from 'vitest';
import { hexToRgb, isDarkColor, normalizeHexColor } from '../src/utils/color.js';

describe('normalizeHexColor', () => {
  it('normalizes lowercase without hash', () => {
    expect(normalizeHexColor('3267d6')).toBe('#3267D6');
  });

  it('throws on invalid length', () => {
    expect(() => normalizeHexColor('#12345')).toThrow(/Invalid hex color/);
  });
});

describe('hexToRgb', () => {
  it('converts hex to rgb', () => {
    expect(hexToRgb('#FF0000')).toEqual({ r: 255, g: 0, b: 0 });
  });
});

describe('isDarkColor', () => {
  it('detects dark colors', () => {
    expect(isDarkColor('#000000')).toBe(true);
    expect(isDarkColor('#FFFFFF')).toBe(false);
  });
});
