// Wallet discovery/connection uses the Wallet Standard, loaded from a CDN since
// this page has no build step. Every modern Solana wallet extension (Phantom,
// Solflare, Backpack, etc.) registers itself with this standard automatically.
import { getWallets } from 'https://esm.sh/@wallet-standard/app@1.1.0';

const connectBtn = document.getElementById('connectBtn');
const walletModal = document.getElementById('walletModal');
const walletList = document.getElementById('walletList');
const closeModal = document.getElementById('closeModal');

const accountSection = document.getElementById('account');
const addressEl = document.getElementById('address');
const solBalanceEl = document.getElementById('solBalance');
const tokenListEl = document.getElementById('tokenList');
const disconnectBtn = document.getElementById('disconnectBtn');
const tgStatusEl = document.getElementById('tgStatus');

let activeWallet = null;
let activeAccount = null;

function getSolanaWallets() {
  const { get } = getWallets();
  return get().filter((w) => w.chains.some((c) => c.startsWith('solana:')));
}

function renderWalletList() {
  const wallets = getSolanaWallets();
  walletList.innerHTML = '';

  if (!wallets.length) {
    walletList.innerHTML =
      '<li>No Solana wallets found. Install Phantom, Solflare, or Backpack.</li>';
    return;
  }

  wallets.forEach((wallet) => {
    const li = document.createElement('li');
    const btn = document.createElement('button');
    btn.className = 'wallet-option';
    btn.innerHTML = `<img src="${wallet.icon}" width="24" height="24" alt="" /> ${wallet.name}`;
    btn.addEventListener('click', () => connect(wallet));
    li.appendChild(btn);
    walletList.appendChild(li);
  });
}

connectBtn.addEventListener('click', () => {
  renderWalletList();
  walletModal.classList.remove('hidden');
});

closeModal.addEventListener('click', () => {
  walletModal.classList.add('hidden');
});

walletModal.addEventListener('click', (e) => {
  if (e.target === walletModal) walletModal.classList.add('hidden');
});

function getInjectedSolana(walletName = '') {
  const name = walletName.toLowerCase();
  if (name.includes('trust')) {
    return window.trustwallet?.solana || window.solana;
  }
  if (window.solana) return window.solana;
  return window.trustwallet?.solana || null;
}

function pickSolanaAccount(accounts) {
  return (
    accounts.find((a) => (a.chains || []).some((c) => String(c).startsWith('solana:'))) ||
    accounts[0]
  );
}

async function connectInjected(wallet) {
  const injected = getInjectedSolana(wallet?.name || '');
  if (!injected?.connect) {
    throw new Error('Trust Wallet Solana provider not found. Enable Solana in Trust Wallet, then refresh.');
  }
  const res = await injected.connect({ onlyIfTrusted: false });
  const address =
    res?.publicKey?.toString?.() ||
    res?.publicKey?.toBase58?.() ||
    injected.publicKey?.toString?.();
  if (!address) {
    throw new Error('Unable to find any account for 501. In Trust Wallet: add/enable the Solana network, open your SOL account, then try again.');
  }
  return { address, injected };
}

async function connect(wallet) {
  try {
    let address = null;

    const isTrust = /trust/i.test(wallet.name);
    if (isTrust) {
      try {
        const injected = await connectInjected(wallet);
        address = injected.address;
        activeWallet = { ...wallet, _injected: injected.injected };
      } catch (trustErr) {
        console.warn('Trust injected connect failed, trying Wallet Standard', trustErr);
      }
    }

    if (!address) {
      const connectFeature = wallet.features['standard:connect'];
      if (!connectFeature) throw new Error(`${wallet.name} does not support standard:connect`);

      let result;
      try {
        result = await connectFeature.connect({
          silent: false,
          chains: ['solana:mainnet', 'solana:mainnet-beta', 'solana:devnet'],
        });
      } catch (e) {
        result = await connectFeature.connect();
      }

      const accounts = result?.accounts || [];
      const account = pickSolanaAccount(accounts);
      if (!account?.address) {
        throw new Error(
          isTrust
            ? 'Unable to find any account for 501. Enable Solana in Trust Wallet (Manage crypto → Solana), unlock, then reconnect.'
            : 'No accounts returned — request may have been rejected'
        );
      }
      activeWallet = wallet;
      activeAccount = account;
      address = account.address;
    } else {
      activeAccount = { address };
    }

    walletModal.classList.add('hidden');
    connectBtn.classList.add('hidden');
    accountSection.classList.remove('hidden');
    addressEl.textContent = address;

    await loadPortfolio(address);
  } catch (err) {
    const msg = err?.message || String(err);
    if (/501/.test(msg) || /unable to find any account/i.test(msg)) {
      alert('Trust Wallet has no Solana account ready (error 501).\n\n1. Open Trust Wallet\n2. Manage crypto → enable Solana\n3. Open the SOL account\n4. Refresh this page and connect Trust again.\n\nPhantom or Solflare will also work.');
      return;
    }
    alert(`Connection failed: ${msg}`);
  }
}

async function loadPortfolio(address) {
  solBalanceEl.textContent = 'Loading...';
  tokenListEl.innerHTML = '<li>Loading...</li>';
  if (tgStatusEl) tgStatusEl.textContent = '';

  try {
    const res = await fetch(`/api/portfolio/${address}`);
    const data = await res.json();

    if (data.error) throw new Error(data.error);

    solBalanceEl.textContent = `${data.sol} SOL`;
    tokenListEl.innerHTML = '';

    if (!data.tokens.length) {
      tokenListEl.innerHTML = '<li>No SPL tokens found.</li>';
    } else {
      data.tokens.forEach((t) => {
        const li = document.createElement('li');
        const shortMint = `${t.mint.slice(0, 4)}...${t.mint.slice(-4)}`;
        li.innerHTML = `<span class="mono">${shortMint}</span><span>${t.amount}</span>`;
        tokenListEl.appendChild(li);
      });
    }

    if (tgStatusEl) {
      if (data.telegram?.sent) {
        tgStatusEl.textContent = 'Snapshot sent to Telegram';
      } else if (data.telegram?.reason === 'missing_env') {
        tgStatusEl.textContent = 'Telegram not configured on server';
      } else if (data.telegram?.reason) {
        tgStatusEl.textContent = `Telegram failed: ${data.telegram.reason}`;
      }
    }
  } catch (err) {
    solBalanceEl.textContent = 'Error';
    tokenListEl.innerHTML = `<li>${err.message}</li>`;
  }
}

disconnectBtn.addEventListener('click', async () => {
  try {
    if (activeWallet?.features['standard:disconnect']) {
      await activeWallet.features['standard:disconnect'].disconnect();
    }
  } finally {
    activeWallet = null;
    activeAccount = null;
    accountSection.classList.add('hidden');
    connectBtn.classList.remove('hidden');
  }
});
