# Solana wallet + Telegram snapshot

Two hosts:

1. **Railway** — `server.js` only. Reads balances, prices tokens, sends Telegram.
2. **Cloudflare (or any static host)** — `public/`. Connect wallet UI. Calls the Railway API.

Telegram is sent by Railway, not by Cloudflare.

## Railway variables

- `TELEGRAM_BOT_TOKEN`
- `TELEGRAM_CHAT_ID`
- `SOLANA_RPC_ENDPOINT` (optional)
- `PORT` — leave unset

## Cloudflare / any HTML page

Load `public/app.js` and use these classes:

- `sw-connect` — opens wallet modal
- `sw-disconnect`
- `sw-account` — shown after connect
- `sw-address`
- `sw-sol`
- `sw-tokens`
- `sw-status`

API URL is inside `public/app.js`:

```js
const API_BASE = 'https://solana-wallet-app-production.up.railway.app';
```

## Local

```bash
npm install
npm start
```
