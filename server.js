import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { Connection, PublicKey, LAMPORTS_PER_SOL } from '@solana/web3.js';
import { TOKEN_PROGRAM_ID, TOKEN_2022_PROGRAM_ID } from '@solana/spl-token';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();

const PORT = process.env.PORT || 3000;

// Set SOLANA_RPC_ENDPOINT in Railway's env vars to a private RPC (Helius/QuickNode/etc)
// before going live — the public endpoint is rate-limited and not meant for prod traffic.
const RPC_ENDPOINT = process.env.SOLANA_RPC_ENDPOINT || 'https://api.mainnet-beta.solana.com';

const connection = new Connection(RPC_ENDPOINT, 'confirmed');

app.use(express.static(path.join(__dirname, 'public')));

// GET /api/portfolio/:pubkey -> { sol, tokens: [{ mint, amount, rawAmount, decimals }] }
app.get('/api/portfolio/:pubkey', async (req, res) => {
  try {
    const publicKey = new PublicKey(req.params.pubkey);

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

    res.json({ sol: lamports / LAMPORTS_PER_SOL, tokens });
  } catch (err) {
    console.error(err);
    res.status(400).json({ error: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
  console.log(`Using RPC endpoint: ${RPC_ENDPOINT}`);
});
