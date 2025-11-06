# TON Colours Backend

A minimal Express-based backend that mints colour NFTs on TON for a Telegram Mini App. The service receives the Telegram user identifier, their wallet address, and a HEX colour, then triggers minting in a pre-deployed NFT collection while exposing metadata rendered as on-the-fly SVG.

## Features

- ✅ Simple REST API (`POST /mint`) for colour NFT minting
- ✅ Generates deterministic SVG artwork for each colour
- ✅ Serves NFT metadata via `GET /metadata/:itemIndex`
- ✅ Queue-serialised minting to avoid race conditions on collection index
- ✅ Optional Telegram bot webhook that captures user IDs and triggers mints directly from chat or the mini app
- ✅ Written in modern ES modules with lightweight dependencies
- ✅ Covered by Vitest unit and integration tests

## Prerequisites

- Node.js 18+
- Existing TON NFT collection deployed with standard collection contract
- Mnemonic phrase for the minter wallet that owns sufficient TON and is authorised to mint in the collection
- TON HTTP API (Toncenter or compatible) endpoint and optional API key

## Quick Start

1. **Install dependencies**

   ```bash
   npm install
   ```

2. **Copy environment template**

   ```bash
   cp .env.example .env
   ```

3. **Populate `.env`**

   | Variable | Description |
   | --- | --- |
   | `PORT` | HTTP port to expose (default `3000`) |
   | `TON_HTTP_ENDPOINT` | Toncenter-compatible JSON-RPC endpoint |
   | `TON_API_KEY` | Optional API key for the endpoint |
   | `MINT_WALLET_MNEMONIC` | 24-word seed phrase of the minter wallet |
   | `NFT_COLLECTION_ADDRESS` | TON address of your NFT collection |
   | `NFT_ITEM_DEPLOY_AMOUNT_TON` | Forwarded TON amount to initialise each NFT item (default `0.05`) |
   | `NFT_COLLECTION_MINT_VALUE_TON` | Total TON sent to the collection per mint (default `0.1`) |
   | `BACKEND_PUBLIC_BASE_URL` | Public URL used to build metadata URIs |
   | `TELEGRAM_BOT_TOKEN` | (Optional) Telegram bot token; enables webhook handling when provided |
   | `TELEGRAM_WEBHOOK_PATH` | Relative path for the Telegram webhook endpoint (default `/telegram/webhook`) |
   | `TELEGRAM_WEBHOOK_SECRET` | Optional secret token validated against the `X-Telegram-Bot-Api-Secret-Token` header |
   | `TELEGRAM_SET_WEBHOOK` | Set to `true` to let the backend register the webhook automatically on startup |

4. **Run the server**

   ```bash
   npm start
   ```

5. **API Endpoints**

    - `POST /mint`

       ```json
       {
          "walletAddress": "EQ...",
          "telegramUserId": 123456789,
          "color": "#FFAA33"
       }
       ```

     Returns `202 Accepted` with mint submission details.

   - `GET /metadata/:itemIndex?color=FFAABB&wallet=EQ...&tg=123`
     Responds with compliant NFT metadata JSON including an inline SVG.

   - `POST /telegram/webhook`
      Telegram update endpoint (exact path configurable via `TELEGRAM_WEBHOOK_PATH`). Telegram must deliver updates with the optional secret token header when `TELEGRAM_WEBHOOK_SECRET` is set.

   - `GET /telegram/webhook/sessions`
      Development-only endpoint that returns the in-memory session snapshot captured from Telegram users (disabled in production).

## Telegram Bot Integration

Set `TELEGRAM_BOT_TOKEN` in your environment to enable the built-in Telegram webhook. When active the backend will:

- Capture the Telegram user identifier as soon as they send `/start` or interact via the mini app.
- Accept commands such as `/wallet <address>` and `/mint <hex> [address]` directly in chat.
- Process mini app payloads sent through `web_app_data`, automatically queueing mint requests.
- Pass the captured `telegramUserId` into the on-chain mint script (`TON_COLOURS_ITEM_TELEGRAM_ID` env variable) so it appears in NFT metadata.

### Webhook Setup

1. Expose the backend over HTTPS (Telegram requires TLS).
2. Configure `BACKEND_PUBLIC_BASE_URL` to the public origin (e.g. `https://api.example.com`).
3. Set `TELEGRAM_WEBHOOK_PATH` if you need a custom path (defaults to `/telegram/webhook`).
4. Optionally set `TELEGRAM_WEBHOOK_SECRET` for extra verification — it must match the `secret_token` supplied when calling Telegram's `setWebhook`.
5. Toggle `TELEGRAM_SET_WEBHOOK=true` to let the backend register the webhook automatically on startup, or run the following manually:

    ```bash
    curl -X POST \
       "https://api.telegram.org/bot<YOUR_TOKEN>/setWebhook" \
       -H 'Content-Type: application/json' \
       -d '{
          "url": "https://api.example.com/telegram/webhook",
          "drop_pending_updates": true,
          "secret_token": "<same-as-TELEGRAM_WEBHOOK_SECRET>"
       }'
    ```

The in-memory session tracker powers the `/telegram/webhook/sessions` debug endpoint (non-production only) so you can verify that user IDs, wallet addresses, and mint outcomes are stored before wiring persistent storage.

## Deriving the collection address

Use the helper script to compute the deterministic TON address of your NFT collection **before** deploying the contract:

```bash
npm run derive:collection-address
```

The script reads your current `.env` file, derives the admin address (either from `NFT_COLLECTION_ADMIN_ADDRESS` or `MINT_WALLET_MNEMONIC`), and prints the resulting collection address alongside the metadata URIs that will be embedded into the contract state. By default it also writes the `StateInit`, `code`, and `data` BOC files into the `build/` directory so you can deploy the contract with external tools.

Options:

- `--output=path` – change the output directory for the BOC artifacts (defaults to `build/`).
- `--no-artifacts` – skip writing any files; only print the derived address.
- `--json` – emit the results as JSON (useful for scripting or CI pipelines).

Additional optional environment variables:

| Variable | Purpose |
| --- | --- |
| `NFT_COLLECTION_ADMIN_ADDRESS` | Overrides the admin/owner address instead of deriving it from the mnemonic |
| `NFT_COLLECTION_ROYALTY_ADDRESS` | Sends royalties to a dedicated address |
| `NFT_COLLECTION_ROYALTY_PERCENT` | Sets the royalty share (decimal between 0 and 1) |
| `NFT_COLLECTION_CONTENT_URI` | Explicit collection metadata URI |
| `NFT_ITEM_CONTENT_BASE_URI` | Base URI used for individual NFT metadata |
| `NFT_COLLECTION_STATEINIT_BASENAME` | Basename for the generated `.boc` artifacts |

## Deploying the smart contract

Once you are satisfied with the derived parameters and have funded the deployer wallet, run:

```bash
npm run deploy:collection -- --amount=0.5
```

The command sends a deployment transfer from the wallet described by `MINT_WALLET_MNEMONIC`, attaching the previously generated StateInit cell. Adjust `--amount` to the TON value you want the collection to hold after deployment (it must exceed the required storage rent). You can also pass `--stateinit=path/to/stateinit.boc` if you renamed or relocated the artifact.

> **Reminder:** ensure the deployer wallet is deployed on the same network as `TON_HTTP_ENDPOINT` and has enough balance to cover both the transfer amount and network fees.

## Architecture Notes

- Uses [`tonweb`](https://github.com/toncenter/tonweb) for NFT collection interactions.
- Converts mnemonic → ed25519 key pair with `@ton/crypto`.
- Serialises mint requests via an in-process queue to guarantee sequential `itemIndex` usage.
- Metadata URIs include all necessary context (colour, Telegram ID, wallet) to avoid persistence requirements.

## Testing

```bash
npm test
```

Vitest covers helpers and the metadata endpoint; the `/mint` path is intentionally not executed during tests to avoid real blockchain calls. You can mock `mintColorNft` in downstream tests if deeper integration is needed.

## Production Checklist

- Deploy the backend behind HTTPS.
- Secure the `/mint` endpoint (e.g., validate Telegram signatures or add auth tokens).
- Monitor the minter wallet balance and replenish as needed.
- Consider persisting mint results if you require historical analytics beyond deterministic metadata.

Enjoy colouring the TON blockchain! 🎨
