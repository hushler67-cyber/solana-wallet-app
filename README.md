# Solana Wallet Connect

A minimal, no-build-step app: a static HTML page with a "Connect Wallet" button
(wallet selection modal, SOL balance, and all SPL token balances) backed by an
Express server that does the RPC calls.

## How it works

- **Frontend** (`public/`): detects installed wallets via the Wallet Standard,
  handles the connect/approve flow, and calls the backend for balances.
- **Backend** (`server.js`): serves the static frontend and exposes
  `GET /api/portfolio/:pubkey`, which fetches SOL balance + every SPL token
  (Token Program and Token-2022) for that address.

Balances are fetched server-side so your RPC endpoint (and any API key baked
into it) never gets exposed to the browser.

## Local development

```bash
npm install
npm start
```

Visit `http://localhost:3000`.

## Deploying to Railway

1. Push this project to a GitHub repo (or use `railway up` from the CLI).
2. In Railway: **New Project → Deploy from GitHub repo**, select this repo.
3. Railway auto-detects Node from `package.json` and runs `npm install && npm start`.
4. In the **Variables** tab, add:
   - `SOLANA_RPC_ENDPOINT` — your RPC URL (Helius/QuickNode/Alchemy). Don't
     rely on the public `api.mainnet-beta.solana.com` endpoint in production —
     it rate-limits hard.
5. Railway assigns a public domain automatically (or add your own under Settings → Domains).

No other config is needed — `server.js` reads `PORT` from Railway automatically.

## Notes / next steps

- Token balances show mint addresses, not names/logos. Adding a Jupiter
  token-list lookup or Metaplex metadata fetch would give you symbols and icons.
- The wallet modal lists whatever wallets are installed in the user's browser
  (Phantom, Solflare, Backpack, etc.) — nothing is hardcoded.
- For devnet/testnet, just point `SOLANA_RPC_ENDPOINT` at a devnet RPC.
