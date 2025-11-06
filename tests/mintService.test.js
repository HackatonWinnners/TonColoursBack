import { describe, expect, it, beforeEach, vi } from 'vitest';
import { EventEmitter } from 'node:events';
import path from 'node:path';
import config from '../src/config/env.js';

const getAddressInfoMock = vi.fn();

vi.mock('node:child_process', () => ({
  spawn: vi.fn(),
}));

vi.mock('../src/services/tonClient.js', () => {
  const addressObject = {
    toString: vi.fn(() => 'EQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAM9c'),
  };

  return {
    getMinterWallet: vi.fn(async () => ({
      wallet: {
        getAddress: vi.fn(async () => addressObject),
      },
      keyPair: {
        publicKey: Buffer.alloc(32),
        secretKey: Buffer.alloc(64),
      },
    })),
    getTonWeb: () => ({
      provider: {
        getAddressInfo: getAddressInfoMock,
      },
    }),
  };
});

const { spawn } = await import('node:child_process');
const { mintColorNft } = await import('../src/services/mintService.js');

function createMockChild() {
  const child = new EventEmitter();
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();
  child.kill = vi.fn();
  return child;
}

async function flushAsyncWork() {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

const expectedCwd = path.resolve(process.cwd(), 'the-path-season-1-nft');

describe('mintService.mintColorNft', () => {
  beforeEach(() => {
    spawn.mockReset();
    getAddressInfoMock.mockReset();
    getAddressInfoMock.mockResolvedValue({ state: 'active', balance: '100000000000' });
  });

  it('spawns blueprint script with tonkeeper testnet flags and parses output', async () => {
    const child = createMockChild();
    spawn.mockReturnValueOnce(child);

    const mintPromise = mintColorNft({
      walletAddress: 'EQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAM9c',
      telegramUserId: 77,
      color: '#ff0000',
    });

    await flushAsyncWork();

    expect(getAddressInfoMock).toHaveBeenCalledTimes(1);

    expect(spawn).toHaveBeenCalledTimes(1);
    const [command, args, options] = spawn.mock.calls[0];
    expect(command).toBe('npx');
    expect(args).toEqual([
      'blueprint',
      'run',
      '--testnet',
      '--mnemonic',
      'deployNftItem',
      'EQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAM9c',
    ]);
    expect(options.cwd).toBe(expectedCwd);
    expect(options.env.TON_COLOURS_ITEM_COLOR).toBe('#FF0000');
    expect(options.env.TON_COLOURS_ITEM_OWNER).toBe('EQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAM9c');
    expect(options.env.TON_COLOURS_COLLECTION_ADDRESS).toBeDefined();
    expect(options.env.WALLET_MNEMONIC.split(' ').length).toBe(24);
    expect(options.env.WALLET_VERSION).toBe(config.walletVersion);

    child.stdout.emit('data', Buffer.from('Minting...\n'));
    child.stdout.emit('data', Buffer.from('MINT_RESULT={"itemIndex":7,"itemContent":"7?color=FF0000","nftAddress":"EQminted","mintedAt":"2025-01-01T00:00:00.000Z"}\n'));
    child.emit('close', 0, null);

    const result = await mintPromise;
    expect(result.itemIndex).toBe(7);
    expect(result.nftAddress).toBe('EQminted');
    expect(result.metadataUri).toContain('/metadata/7');
    expect(result.metadataUri).toContain('mintedAt=2025-01-01T00%3A00%3A00.000Z');
    expect(result.mintedAt).toBe('2025-01-01T00:00:00.000Z');
  });

  it('throws when blueprint script does not emit a result payload', async () => {
    const child = createMockChild();
    spawn.mockReturnValueOnce(child);

    const mintPromise = mintColorNft({
      walletAddress: 'EQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAM9c',
      telegramUserId: 99,
      color: '#00FF00',
    });

    await flushAsyncWork();

    child.stdout.emit('data', Buffer.from('some log\n'));
    child.emit('close', 0, null);

    await expect(mintPromise).rejects.toThrow(/result payload/);
  });

  it('throws when script exits with an error', async () => {
    const child = createMockChild();
    spawn.mockReturnValueOnce(child);

    const mintPromise = mintColorNft({
      walletAddress: 'EQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAM9c',
      telegramUserId: 123,
      color: '#ABCDEF',
    });

    await flushAsyncWork();

    child.stderr.emit('data', Buffer.from('boom\n'));
    child.emit('close', 1, null);

    await expect(mintPromise).rejects.toThrow(/abnormally/);
  });

  it('continues when minter wallet balance is insufficient', async () => {
    getAddressInfoMock.mockResolvedValueOnce({ state: 'active', balance: '0' });

    const child = createMockChild();
    spawn.mockReturnValueOnce(child);

    const mintPromise = mintColorNft({
      walletAddress: 'EQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAM9c',
      telegramUserId: 42,
      color: '#112233',
    });

    await flushAsyncWork();

    expect(spawn).toHaveBeenCalledTimes(1);

    child.stdout.emit('data', Buffer.from('MINT_RESULT={"itemIndex":12,"nftAddress":"EQlow","mintedAt":"2025-03-01T00:00:00.000Z"}\n'));
    child.emit('close', 0, null);

    const result = await mintPromise;
    expect(result.itemIndex).toBe(12);
    expect(result.nftAddress).toBe('EQlow');
  });

  it('queues mint requests sequentially', async () => {
    const firstChild = createMockChild();
    const secondChild = createMockChild();

    spawn.mockImplementationOnce(() => firstChild);
    spawn.mockImplementationOnce(() => secondChild);

    const firstPromise = mintColorNft({
      walletAddress: 'EQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAM9c',
      telegramUserId: 1,
      color: '#112233',
    });

    const secondPromise = mintColorNft({
      walletAddress: 'EQBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBU',
      telegramUserId: 2,
      color: '#445566',
    });

    await flushAsyncWork();

    expect(spawn).toHaveBeenCalledTimes(1);

    firstChild.stdout.emit('data', Buffer.from('MINT_RESULT={"itemIndex":10,"nftAddress":"EQfirst","mintedAt":"2025-02-01T00:00:00.000Z"}\n'));
    firstChild.emit('close', 0, null);

    const firstResult = await firstPromise;
    await flushAsyncWork();

    expect(spawn).toHaveBeenCalledTimes(2);

    secondChild.stdout.emit('data', Buffer.from('MINT_RESULT={"itemIndex":11,"nftAddress":"EQsecond","mintedAt":"2025-02-01T00:05:00.000Z"}\n'));
    secondChild.emit('close', 0, null);

    const secondResult = await secondPromise;
    expect(secondResult.itemIndex).toBe(11);
    expect(secondResult.nftAddress).toBe('EQsecond');
    expect(secondResult.mintedAt).toBe('2025-02-01T00:05:00.000Z');
    expect(secondResult.metadataUri).toContain('mintedAt=2025-02-01T00%3A05%3A00.000Z');

    expect(firstResult.mintedAt).toBe('2025-02-01T00:00:00.000Z');
    expect(firstResult.metadataUri).toContain('mintedAt=2025-02-01T00%3A00%3A00.000Z');
  });
});
