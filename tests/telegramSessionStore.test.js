import { beforeEach, describe, expect, it } from 'vitest';
import { TelegramSessionStore } from '../src/services/telegramSessionStore.js';

describe('TelegramSessionStore', () => {
  let store;

  beforeEach(() => {
    store = new TelegramSessionStore();
  });

  it('upserts users and stores profile information', () => {
    const user = {
      id: 123,
      username: 'ton_user',
      first_name: 'Ton',
      last_name: 'Colours',
      language_code: 'en',
    };

    const session = store.upsertUser(user);

    expect(session.userId).toBe(123);
    expect(session.username).toBe('ton_user');
    expect(session.firstName).toBe('Ton');
    expect(store.get(123)).toEqual(session);

    const updated = store.upsertUser({
      id: 123,
      username: 'ton_user',
      first_name: 'TON',
    });

    expect(updated.firstName).toBe('TON');
    expect(updated.lastName).toBe('Colours');
  });

  it('records wallet, colour, and mint summary', () => {
    const user = { id: 7 };
    store.upsertUser(user);

    store.setWallet(7, 'EQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAM9c');
    store.setLastColor(7, '#FF00AA');

    const summary = store.recordMint(7, {
      itemIndex: 42,
      metadataUri: 'https://example.com/metadata/42',
      nftAddress: 'EQminted',
      color: '#FF00AA',
      ownerAddress: 'EQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAM9c',
      timestamp: '2025-01-01T00:00:00.000Z',
      mintedAt: '2025-01-01T00:00:00.000Z',
      source: 'mini-app',
    });

    expect(summary.lastMint.itemIndex).toBe(42);
    expect(summary.lastColor).toBe('#FF00AA');
    expect(summary.totalMints).toBe(1);
    expect(summary.lastMint.mintedAt).toBe('2025-01-01T00:00:00.000Z');
    expect(summary.lastMint.source).toBe('mini-app');
  });

  it('returns all sessions', () => {
    store.upsertUser({ id: 1 });
    store.upsertUser({ id: 2 });
    const users = store.all();
    expect(users).toHaveLength(2);
  });
});
