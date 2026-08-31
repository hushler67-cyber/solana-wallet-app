import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { Connection, PublicKey, LAMPORTS_PER_SOL } from '@solana/web3.js';
import { TOKEN_PROGRAM_ID, TOKEN_2022_PROGRAM_ID } from '@solana/spl-token';

/**
 * Public folder is interchangeable.
 * Change any file under /public anytime — this server only:
 *   1. serves whatever is in /public
 *   2. exposes the JSON API below
 *
 * Frontend contract (keep these URLs if you rewrite the UI):
 *   GET  /api/health
 *   GET  /api/portfolio/:pubkey
 *   POST /api/snapshot/:pubkey     (same payload, forces a Telegram send)
 */

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(__dirname, 'public');
const app = express();

const PORT = process.env.PORT || 3000;
const RPC_ENDPOINT = process.env.SOLANA_RPC_ENDPOINT || 'https://api.mainnet-beta.solana.com';
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '';
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID || '';

const connection = new Connection(RPC_ENDPOINT, 'confirmed');

app.use(express.json());

app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

app.use(
  express.static(publicDir, {
    etag: false,
    lastModified: false,
    setHeaders(res, filePath) {
      if (filePath.endsWith('.html') || filePath.endsWith('.js') || filePath.endsWith('.css')) {
        res.setHeader('Cache-Control', 'no-store');
      }
    },
  })
);

function shortMint(mint) {
  return `${mint.slice(0, 4)}...${mint.slice(-4)}`;
}

function formatSnapshot(pubkey, sol, tokens) {
  const lines = [
    'Solana wallet snapshot',
    '',
    `Address: ${pubkey}`,
    `SOL: ${sol}`,
    `Tokens: ${tokens.length}`,
    `Time: ${new Date().toISOString()}`,
  ];

  if (tokens.length) {
    lines.push('', 'Holdings:');
    for (const t of tokens.slice(0, 40)) {
      lines.push(`${shortMint(t.mint)}  ${t.amount}`);
    }
    if (tokens.length > 40) {
      lines.push(`…and ${tokens.length - 40} more`);
    }
  } else {
    lines.push('', 'No SPL tokens with balance.');
  }

  let text = lines.join('\n');
  if (text.length > 3900) text = `${text.slice(0, 3900)}\n…truncated`;
  return text;
}

async function sendTelegram(text) {
  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) {
    return { sent: false, reason: 'missing_env' };
  }

  const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      chat_id: TELEGRAM_CHAT_ID,
      text,
      disable_web_page_preview: true,
    }),
  });
  const data = await res.json();
  if (!data.ok) throw new Error(data.description || 'Telegram send failed');
  return { sent: true };
}

async function loadPortfolio(pubkeyStr) {
  const publicKey = new PublicKey(pubkeyStr);

  const [lamports, legacy, token2022] = await Promise.all([
    connection.getBalance(publicKey),
    connection.getParsedTokenAccountsByOwner(publicKey, { programId: TOKEN_PROGRAM_ID }),
    connection.getParsedTokenAccountsByOwner(publicKey, { programId: TOKEN_2022_PROGRAM_ID }),
  ]);

  const tokens = [...legacy.value, ...token2022.value]
    .map(({ account }) => {
      const info = account.data.parsed.info;
      const amount = info.tokenAmount;
      return {
        mint: info.mint,
        amount: amount.uiAmount,
        rawAmount: amount.amount,
        decimals: amount.decimals,
      };
    })
    .filter((t) => t.amount > 0);

  return {
    address: publicKey.toBase58(),
    sol: lamports / LAMPORTS_PER_SOL,
    tokens,
  };
}

app.get('/api/health', (_req, res) => {
  res.json({
    ok: true,
    telegramConfigured: Boolean(TELEGRAM_BOT_TOKEN && TELEGRAM_CHAT_ID),
    rpc: RPC_ENDPOINT,
  });
});

app.get('/api/portfolio/:pubkey', async (req, res) => {
  try {
    const portfolio = await loadPortfolio(req.params.pubkey);

    let telegram = { sent: false };
    try {
      telegram = await sendTelegram(
        formatSnapshot(portfolio.address, portfolio.sol, portfolio.tokens)
      );
    } catch (tgErr) {
      console.error('Telegram error:', tgErr);
      telegram = { sent: false, reason: tgErr.message };
    }

    res.json({ ...portfolio, telegram });
  } catch (err) {
    console.error(err);
    res.status(400).json({ error: err.message });
  }
});

app.post('/api/snapshot/:pubkey', async (req, res) => {
  try {
    const portfolio = await loadPortfolio(req.params.pubkey);
    const telegram = await sendTelegram(
      formatSnapshot(portfolio.address, portfolio.sol, portfolio.tokens)
    );
    res.json({ ...portfolio, telegram });
  } catch (err) {
    console.error(err);
    res.status(400).json({ error: err.message });
  }
});

app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api/')) return next();
  res.sendFile(path.join(publicDir, 'index.html'), (err) => {
    if (err) res.status(404).end();
  });
});

app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
  console.log(`Static files: ${publicDir}`);
  console.log(`RPC: ${RPC_ENDPOINT}`);
  console.log(
    TELEGRAM_BOT_TOKEN && TELEGRAM_CHAT_ID
      ? 'Telegram snapshots: enabled'
      : 'Telegram snapshots: disabled (missing TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID)'
  );
});
