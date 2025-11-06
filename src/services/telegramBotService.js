import express from 'express';
import config from '../config/env.js';
import { assertHexColor, assertTonAddress } from '../utils/validation.js';
import { normalizeHexColor } from '../utils/color.js';
import { mintColorNft } from './mintService.js';
import { createTelegramSessionStore } from './telegramSessionStore.js';

const HELP_MESSAGE = [
  'Welcome to TON Colours! 🎨',
  '',
  'Available commands:',
  '• /start — register yourself with the bot and see this help',
  '• /wallet <TON address> — set or update the wallet used for minting',
  '• /mint <hex colour> [TON address] — mint the specified colour NFT (wallet optional if already set)',
  '',
  'You can also use the Telegram Mini App to submit mint requests — the bot will process the payload automatically.',
].join('\n');

const DEFAULT_ACK_MESSAGE = 'Mint request received! This may take ~20-40 seconds. I\'ll keep you posted.';

function formatTelegramUserForLog(user) {
  if (!user || typeof user !== 'object') {
    return 'unknown user';
  }
  const parts = [`id=${user.id}`];
  if (user.username) {
    parts.push(`username=@${user.username}`);
  }
  const name = [user.first_name, user.last_name].filter(Boolean).join(' ');
  if (name) {
    parts.push(`name="${name}"`);
  }
  if (user.language_code) {
    parts.push(`language=${user.language_code}`);
  }
  return parts.join(', ');
}

function sanitizeCommand(input) {
  if (typeof input !== 'string') {
    return null;
  }
  const trimmed = input.trim();
  if (!trimmed.startsWith('/')) {
    return null;
  }
  const [commandPart] = trimmed.split(/\s+/, 1);
  if (!commandPart) {
    return null;
  }
  const base = commandPart.split('@')[0];
  return base.toLowerCase();
}

function parseCommand(input) {
  if (typeof input !== 'string') {
    return null;
  }
  const trimmed = input.trim();
  if (!trimmed.startsWith('/')) {
    return null;
  }
  const parts = trimmed.split(/\s+/);
  const commandToken = parts.shift();
  if (!commandToken) {
    return null;
  }
  const command = commandToken.split('@')[0].toLowerCase();
  return { command, args: parts };
}

function truncateAddress(address, { head = 4, tail = 4 } = {}) {
  if (!address || address.length <= head + tail + 2) {
    return address;
  }
  return `${address.slice(0, head)}…${address.slice(-tail)}`;
}

async function tryJson(response) {
  try {
    return await response.json();
  } catch (error) {
    return null;
  }
}

export class TelegramTransport {
  constructor({ apiBaseUrl, botToken }) {
    if (!apiBaseUrl) {
      throw new Error('Telegram API base URL is required');
    }
    this.apiBaseUrl = apiBaseUrl;
    this.botToken = botToken;
  }

  async request(method, body) {
    const response = await fetch(`${this.apiBaseUrl}/${method}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body ?? {}),
    });

    if (!response.ok) {
      const payload = await tryJson(response);
      const description = payload?.description ?? response.statusText;
      throw new Error(`Telegram API error ${response.status}: ${description}`);
    }

    const payload = await response.json();
    if (!payload.ok) {
      const description = payload.description ?? 'Unknown error';
      throw new Error(`Telegram API responded with error: ${description}`);
    }

    return payload.result;
  }

  async sendMessage(params) {
    return this.request('sendMessage', params);
  }

  async setWebhook(params) {
    return this.request('setWebhook', params);
  }
}

export class TelegramBotController {
  constructor({
    transport,
    sessionStore,
    mintHandler,
    webhookPath,
    secretToken,
    backendBaseUrl,
    autoSetWebhook = false,
  }) {
    this.transport = transport;
    this.sessionStore = sessionStore;
    this.mintHandler = mintHandler;
    this.webhookPath = webhookPath;
    this.secretToken = secretToken;
    this.autoSetWebhook = autoSetWebhook;
    this.backendBaseUrl = backendBaseUrl;
    this.webhookUrl = backendBaseUrl ? `${backendBaseUrl}${webhookPath}` : null;
  }

  async ensureWebhook() {
    if (!this.autoSetWebhook || !this.webhookUrl) {
      return;
    }
    try {
      const params = {
        url: this.webhookUrl,
        drop_pending_updates: true,
      };
      if (this.secretToken) {
        params.secret_token = this.secretToken;
      }
      await this.transport.setWebhook(params);
      console.log(`[telegram] Webhook registered at ${this.webhookUrl}`);
    } catch (error) {
      console.error('[telegram] Failed to register webhook', error);
    }
  }

  async handleUpdate(update) {
    if (!update || typeof update !== 'object') {
      return;
    }

    if (update.message) {
      await this.handleMessage(update.message);
      return;
    }

    if (update.edited_message) {
      await this.handleMessage(update.edited_message, { edited: true });
      return;
    }

    if (update.callback_query?.message) {
      await this.handleMessage(update.callback_query.message, { callbackQuery: update.callback_query });
      return;
    }
  }

  async handleMessage(message, { edited = false, callbackQuery = null } = {}) {
    if (!message || typeof message !== 'object') {
      return;
    }

    const fromUser = message.from;
    if (!fromUser || typeof fromUser.id !== 'number') {
      return;
    }

    const chatId = message.chat?.id;
    if (typeof chatId !== 'number' && typeof chatId !== 'string') {
      return;
    }

    this.sessionStore.upsertUser(fromUser);

    if (message.web_app_data?.data) {
      await this.handleWebAppData({
        user: fromUser,
        chatId,
        data: message.web_app_data.data,
      });
      return;
    }

    const text = callbackQuery?.data ?? message.text ?? '';
    const command = parseCommand(text);

    if (!command) {
      if (edited) {
        return;
      }
      await this.sendMessage(chatId, 'I did not recognise that message. Type /help for available commands.');
      return;
    }

    switch (command.command) {
      case '/start':
        await this.handleStart({ user: fromUser, chatId, args: command.args });
        break;
      case '/help':
        await this.handleHelp(chatId);
        break;
      case '/wallet':
        await this.handleWallet({ user: fromUser, chatId, args: command.args });
        break;
      case '/mint':
        await this.handleMint({ user: fromUser, chatId, args: command.args });
        break;
      default:
        await this.sendMessage(chatId, 'Unknown command. Type /help for instructions.');
        break;
    }
  }

  async handleStart({ user, chatId, args }) {
    this.sessionStore.upsertUser(user);
    const argsText = Array.isArray(args) && args.length > 0 ? args.join(' ') : '(none)';
    console.log(`[telegram] User started bot: ${formatTelegramUserForLog(user)} | startArgs=${argsText}`);
    await this.sendMessage(chatId, HELP_MESSAGE);
  }

  async handleHelp(chatId) {
    await this.sendMessage(chatId, HELP_MESSAGE);
  }

  async handleWallet({ user, chatId, args }) {
    if (!args?.length) {
      await this.sendMessage(chatId, 'Usage: /wallet <TON address>');
      return;
    }

    try {
      const normalized = assertTonAddress(args[0]);
      this.sessionStore.setWallet(user.id, normalized);
      await this.sendMessage(chatId, `Wallet saved ✅\n${normalized}`);
    } catch (error) {
      await this.sendMessage(chatId, `❌ Invalid wallet address: ${error.message}`);
    }
  }

  async handleMint({ user, chatId, args }) {
    if (!args || args.length === 0) {
      await this.sendMessage(chatId, 'Usage: /mint <hex colour> [TON address]');
      return;
    }

    const colourInput = args[0];
    const walletOverride = args[1];

    await this.requestMint({
      user,
      chatId,
      colourInput,
      walletOverride,
      source: 'command',
    });
  }

  async handleWebAppData({ user, chatId, data }) {
    try {
      console.log(`[telegram] Mini app payload received: ${formatTelegramUserForLog(user)} | raw=${data}`);
      const parsed = JSON.parse(data);
      const colourInput = parsed.color ?? parsed.colour ?? parsed.hex ?? parsed.hexColor ?? parsed.hex_colour ?? null;
      const walletOverride = parsed.walletAddress ?? parsed.wallet ?? parsed.owner ?? null;

      if (!colourInput) {
        await this.sendMessage(chatId, 'The mini app payload is missing the colour value.');
        return;
      }

      await this.requestMint({
        user,
        chatId,
        colourInput,
        walletOverride,
        source: 'mini-app',
      });
    } catch (error) {
      await this.sendMessage(chatId, 'Failed to parse mini app payload.');
      console.error('[telegram] Failed to parse web_app_data', error);
    }
  }

  async requestMint({ user, chatId, colourInput, walletOverride, source }) {
    let normalizedColour;
    try {
      normalizedColour = assertHexColor(colourInput);
    } catch (error) {
      await this.sendMessage(chatId, `❌ Invalid colour value: ${error.message}`);
      return;
    }

    const session = this.sessionStore.get(user.id) ?? this.sessionStore.touch(user.id);

    let walletSource = walletOverride ?? session?.walletAddress ?? null;
    if (!walletSource) {
      await this.sendMessage(
        chatId,
        'I need a TON wallet address to mint. Use /wallet <address> first or include it in the /mint command.'
      );
      return;
    }

    let normalizedWallet;
    try {
      normalizedWallet = assertTonAddress(walletSource);
    } catch (error) {
      await this.sendMessage(chatId, `❌ Invalid wallet address: ${error.message}`);
      return;
    }

    this.sessionStore.setWallet(user.id, normalizedWallet);
    this.sessionStore.setLastColor(user.id, normalizedColour);

    await this.sendMessage(chatId, DEFAULT_ACK_MESSAGE);

    try {
      const mintResult = await this.mintHandler({
        walletAddress: normalizedWallet,
        telegramUserId: user.id,
        color: normalizedColour,
      });

      const mintedAt = mintResult.mintedAt ?? new Date().toISOString();
      this.sessionStore.recordMint(user.id, {
        itemIndex: mintResult.itemIndex,
        metadataUri: mintResult.metadataUri,
        nftAddress: mintResult.nftAddress,
        color: mintResult.color ?? normalizedColour,
        ownerAddress: mintResult.ownerAddress ?? normalizedWallet,
        mintedAt,
        timestamp: mintedAt,
        source,
      });

      const successMessage = [
        '✅ Mint successful!',
        `Colour: ${normalizeHexColor(normalizedColour)}`,
        `Item #${mintResult.itemIndex}`,
        mintResult.nftAddress ? `NFT Address: ${mintResult.nftAddress}` : null,
        `Metadata: ${mintResult.metadataUri}`,
        mintedAt ? `Minted At: ${mintedAt}` : null,
      ]
        .filter(Boolean)
        .join('\n');

      await this.sendMessage(chatId, successMessage);
    } catch (error) {
      console.error('[telegram] Mint request failed', error);
      const errorMessage = error?.message ?? 'Unknown error';
      await this.sendMessage(chatId, `❌ Mint failed: ${errorMessage}`);
    }
  }

  async sendMessage(chatId, text, extra = {}) {
    try {
      await this.transport.sendMessage({
        chat_id: chatId,
        text,
        disable_web_page_preview: true,
        ...extra,
      });
    } catch (error) {
      console.error('[telegram] Failed to send message', error);
    }
  }
}

export function registerTelegramBot(app, {
  sessionStore = createTelegramSessionStore(),
  transport: providedTransport,
  mintHandler = mintColorNft,
} = {}) {
  if (!config.telegram?.enabled) {
    return null;
  }

  const transport = providedTransport ?? new TelegramTransport(config.telegram);
  const controller = new TelegramBotController({
    transport,
    sessionStore,
    mintHandler,
    webhookPath: config.telegram.webhookPath,
    secretToken: config.telegram.secretToken,
    backendBaseUrl: config.backendBaseUrl,
    autoSetWebhook: config.telegram.autoSetWebhook,
  });

  const router = express.Router();
  router.post('/', express.json(), async (req, res) => {
    try {
      if (controller.secretToken) {
        const header = req.get('X-Telegram-Bot-Api-Secret-Token');
        if (header !== controller.secretToken) {
          console.warn('[telegram] Rejecting update with invalid secret token');
          res.status(401).json({ ok: false });
          return;
        }
      }

      await controller.handleUpdate(req.body);
      res.json({ ok: true });
    } catch (error) {
      console.error('[telegram] Failed to handle update', error);
      res.json({ ok: false });
    }
  });

  if (process.env.NODE_ENV !== 'production') {
    router.get('/sessions', (_req, res) => {
      res.json({ users: sessionStore.all() });
    });
  }

  app.use(config.telegram.webhookPath, router);

  controller.ensureWebhook().catch((error) => {
    console.error('[telegram] ensureWebhook error', error);
  });

  return {
    controller,
    sessionStore,
  };
}

export default {
  registerTelegramBot,
  TelegramBotController,
  TelegramTransport,
};
