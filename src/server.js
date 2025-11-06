import express from 'express';
import morgan from 'morgan';
import config from './config/env.js';
import { mintColorNft } from './services/mintService.js';
import { buildMetadata } from './services/metadataService.js';
import { buildColorSvg } from './services/svgGenerator.js';
import { assertHexColor, assertTelegramUserId, assertTonAddress } from './utils/validation.js';
import { registerTelegramBot } from './services/telegramBotService.js';

const app = express();

app.use(express.json({ limit: '1mb' }));
app.use(morgan('tiny'));

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Handle /image{itemIndex} (no slash) - redirect to proper format
app.get(/^\/image(\d+)/, (req, res) => {
  const match = req.url.match(/^\/image(\d+)/);
  const itemIndex = match[1];
  const queryString = req.url.includes('?') ? req.url.substring(req.url.indexOf('?')) : '';
  res.redirect(301, `/image/${itemIndex}${queryString}`);
});

app.get('/image/:itemIndex', (req, res) => {
  const { color } = req.query;

  if (!color) {
    return res.status(400).json({ error: 'color query parameter is required' });
  }

  let colorHex;
  try {
    colorHex = assertHexColor(`#${String(color).replace(/^#/, '')}`);
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }

  const svg = buildColorSvg(colorHex);
  
  res.setHeader('Content-Type', 'image/svg+xml');
  res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
  res.send(svg);
});

// Handle both /metadata/:itemIndex and /metadata{itemIndex} (no slash - for collection base URL without trailing slash)
app.get(/^\/metadata(\d+)/, (req, res) => {
  // Extract item index from URL
  const match = req.url.match(/^\/metadata(\d+)/);
  const itemIndex = match[1];
  const queryString = req.url.includes('?') ? req.url.substring(req.url.indexOf('?')) : '';
  
  // Redirect to the proper format with slash
  res.redirect(301, `/metadata/${itemIndex}${queryString}`);
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
