import { describe, expect, it } from 'vitest';
import { assertHexColor, assertTelegramUserId, assertTonAddress } from '../src/utils/validation.js';

describe('assertHexColor', () => {
  it('returns normalized color', () => {
    expect(assertHexColor('#00ff00')).toBe('#00FF00');
  });
});

describe('assertTelegramUserId', () => {
  it('accepts numeric values', () => {
    expect(assertTelegramUserId('123')).toBe(123);
  });
});

describe('assertTonAddress', () => {
  it('returns normalized address on success', () => {
    expect(() => assertTonAddress('EQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAM9c')).not.toThrow();
  });

  it('throws on invalid address', () => {
    expect(() => assertTonAddress('invalid')).toThrow();
  });
});
