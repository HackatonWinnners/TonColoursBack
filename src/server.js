import express from 'express';
import morgan from 'morgan';
import config from './config/env.js';
import { mintColorNft } from './services/mintService.js';
import { buildMetadata } from './services/metadataService.js';
import { assertHexColor, assertTelegramUserId, assertTonAddress } from './utils/validation.js';
import { registerTelegramBot } from './services/telegramBotService.js';

const app = express();

app.use(express.json({ limit: '1mb' }));
app.use(morgan('tiny'));

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.get('/metadata/:itemIndex', (req, res) => {
  const { itemIndex } = req.params;
  const { color, wallet, tg, mintedAt } = req.query;

  if (!color) {
    return res.status(400).json({ error: 'color query parameter is required' });
  }

  let walletAddress;
  try {
    if (wallet) {
      walletAddress = assertTonAddress(String(wallet), 'wallet');
    }
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }

  let telegramUserId;
  if (tg !== undefined) {
    const numeric = Number(tg);
    if (Number.isNaN(numeric)) {
      return res.status(400).json({ error: 'tg must be numeric' });
    }
    telegramUserId = numeric;
  }

  let colorHex;
  try {
    colorHex = assertHexColor(`#${String(color).replace(/^#/, '')}`);
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }

  const metadata = buildMetadata({
    itemIndex,
    color: colorHex,
    walletAddress,
    telegramUserId,
    mintedAt,
  });

  res.json(metadata);
});

app.post('/mint', async (req, res, next) => {
  try {
    const { walletAddress, telegramUserId, color } = req.body ?? {};

    const normalizedWallet = assertTonAddress(walletAddress);
    const normalizedColor = assertHexColor(color);
    const numericTelegramId = assertTelegramUserId(telegramUserId);

    const result = await mintColorNft({
      walletAddress: normalizedWallet,
      telegramUserId: numericTelegramId,
      color: normalizedColor,
    });

    res.status(202).json({
      status: 'submitted',
      ...result,
    });
  } catch (error) {
    next(error);
  }
});

app.use((err, _req, res, _next) => {
  console.error('[mint:error]', err);
  const statusCode = typeof err.statusCode === 'number' && Number.isInteger(err.statusCode)
    ? err.statusCode
    : 500;

  const payload = {
    error: err.message ?? 'Internal Server Error',
  };

  if (err.details && typeof err.details === 'object') {
    payload.details = err.details;
  }

  res.status(statusCode).json(payload);
});

registerTelegramBot(app);

if (process.env.NODE_ENV !== 'test') {
  app.listen(config.port, () => {
    console.log(`TON Colours backend listening on port ${config.port}`);
  });
}

export default app;
