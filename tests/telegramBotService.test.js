import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TelegramBotController } from '../src/services/telegramBotService.js';
import { createTelegramSessionStore } from '../src/services/telegramSessionStore.js';

class MockTransport {
  constructor() {
    this.messages = [];
    this.webhooks = [];
  }

  async sendMessage(payload) {
    this.messages.push(payload);
  }

  async setWebhook(params) {
    this.webhooks.push(params);
  }
}

describe('TelegramBotController', () => {
  const wallet = 'EQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAM9c';
  let controller;
  let transport;
  let sessionStore;
  let mintHandler;
  let logSpy;

  beforeEach(() => {
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    transport = new MockTransport();
    sessionStore = createTelegramSessionStore();
    mintHandler = vi.fn().mockResolvedValue({
      itemIndex: 12,
      metadataUri: 'https://backend.example/metadata/12',
      nftAddress: 'EQminted',
      color: '#FFAA00',
      ownerAddress: wallet,
      mintedAt: '2025-03-01T00:00:00.000Z',
    });
    controller = new TelegramBotController({
      transport,
      sessionStore,
      mintHandler,
      webhookPath: '/telegram/webhook',
      backendBaseUrl: 'https://backend.example',
      autoSetWebhook: false,
    });
  });

  afterEach(() => {
    logSpy.mockRestore();
  });

  it('responds to /start with help message', async () => {
    await controller.handleUpdate({
      message: {
        chat: { id: 101 },
        from: { id: 55, first_name: 'Alice' },
        text: '/start',
      },
    });

    expect(transport.messages).toHaveLength(1);
    expect(transport.messages[0].text).toContain('Available commands');
    expect(sessionStore.get(55)).not.toBeNull();

    const startLog = logSpy.mock.calls.find(([message]) => typeof message === 'string' && message.includes('User started bot'));
    expect(startLog).toBeTruthy();
  });

  it('saves wallet via /wallet and uses it for minting', async () => {
    await controller.handleUpdate({
      message: {
        chat: { id: 101 },
        from: { id: 77 },
        text: `/wallet ${wallet}`,
      },
    });

    expect(sessionStore.get(77).walletAddress).toBe(wallet);

    await controller.handleUpdate({
      message: {
        chat: { id: 101 },
        from: { id: 77 },
        text: '/mint #ffaa00',
      },
    });

    expect(mintHandler).toHaveBeenCalledWith({
      walletAddress: wallet,
      telegramUserId: 77,
      color: '#FFAA00',
    });

    const lastMessage = transport.messages.at(-1);
    expect(lastMessage.text).toContain('Mint successful');
    expect(lastMessage.text).toContain('Minted At: 2025-03-01T00:00:00.000Z');

    const session = sessionStore.get(77);
    expect(session.lastMint.mintedAt).toBe('2025-03-01T00:00:00.000Z');
  });

  it('reports invalid colour errors', async () => {
    await controller.handleUpdate({
      message: {
        chat: { id: 500 },
        from: { id: 90 },
        text: '/mint not-a-colour',
      },
    });

    const lastMessage = transport.messages.at(-1);
    expect(lastMessage.text).toContain('Invalid colour value');
    expect(mintHandler).not.toHaveBeenCalled();
  });

  it('handles mini app payloads', async () => {
    await controller.handleUpdate({
      message: {
        chat: { id: 300 },
        from: { id: 300, first_name: 'Mini' },
        web_app_data: {
          data: JSON.stringify({
            color: '#123abc',
            walletAddress: wallet,
          }),
        },
      },
    });

    expect(mintHandler).toHaveBeenCalledWith({
      walletAddress: wallet,
      telegramUserId: 300,
      color: '#123ABC',
    });

    const lastMessage = transport.messages.at(-1);
    expect(lastMessage.text).toContain('Mint successful');
    expect(lastMessage.text).toContain('Minted At: 2025-03-01T00:00:00.000Z');
  });

  it('can register webhook when enabled', async () => {
    controller = new TelegramBotController({
      transport,
      sessionStore,
      mintHandler,
      webhookPath: '/telegram/webhook',
      backendBaseUrl: 'https://backend.example',
      autoSetWebhook: true,
      secretToken: 'secret-token',
    });

    await controller.ensureWebhook();

    expect(transport.webhooks).toHaveLength(1);
    expect(transport.webhooks[0].secret_token).toBe('secret-token');
  });
});
