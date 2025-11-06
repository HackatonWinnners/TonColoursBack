import TonWeb from 'tonweb';
import { normalizeHexColor } from './color.js';

const { Address } = TonWeb.utils;

export function assertTonAddress(value, fieldName = 'walletAddress') {
  if (typeof value !== 'string') {
    throw new Error(`${fieldName} must be a string`);
  }
  try {
    const address = new Address(value.trim());
    return address.toString(true, true, true);
  } catch (error) {
    throw new Error(`${fieldName} must be a valid TON address`);
  }
}

export function assertTelegramUserId(value) {
  if (value === undefined || value === null || value === '') {
    throw new Error('telegramUserId is required');
  }
  const numeric = Number(value);
  if (!Number.isSafeInteger(numeric)) {
    throw new Error('telegramUserId must be a safe integer');
  }
  return numeric;
}

export function assertHexColor(value) {
  return normalizeHexColor(value);
}

export default {
  assertTonAddress,
  assertTelegramUserId,
  assertHexColor,
};
