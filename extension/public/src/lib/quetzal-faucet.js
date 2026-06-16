// extension/public/src/lib/quetzal-faucet.js
// Single source of truth for the Quetzal faucet. One synchronous POST /api/drip
// returns Fee Juice claim data + tUSDC/tETH mint receipts (no polling).
export const QUETZAL_FAUCET_URL = "https://faucet.quetzaldex.xyz/api/drip";

// Quetzal drips run the L1 bridge + L2 mint inline; allow up to 5 min.
export const QUETZAL_DRIP_TIMEOUT_MS = 5 * 60 * 1000;

// The L2 tokens the Quetzal faucet mints (mint_to_public) alongside the Fee
// Juice claim. Knowing these lets the wallet register them so their balances
// show up — the balance reader (offscreen getBalances) already reads
// public+private once a token is in the list; it just never knew these
// addresses.
//
// The addresses below are a FALLBACK only. The faucet redeploys its test
// tokens periodically (observed: several distinct tUSDC/tETH deployments), so
// hardcoding is inherently fragile. When the /api/drip response carries the
// minted token's address (tUSDCMint.tokenAddress / tETHMint.tokenAddress),
// that wins — the wallet then self-heals across faucet token redeploys and the
// constants stop mattering. These live here, in the Quetzal-specific
// integration module that already hardcodes the faucet URL, so the generic
// balance/token code stays token-agnostic.
//
// `decimals` matters: offscreen formats balance as raw / 10**decimals, so a
// wrong value renders a wildly wrong number. tUSDC=6, tETH=18.
// Verified against the live faucet container 2026-06-16.
export const QUETZAL_KNOWN_TOKENS = [
  { key: "tUSDCMint", symbol: "tUSDC", decimals: 6, address: "0x2365f7da7668d8471b387f2a6946359cd431d3ed6f5af5cf227b4d26f6277a50" },
  { key: "tETHMint", symbol: "tETH", decimals: 18, address: "0x2f295ee5dff385343675815acec5e3cbd21c64d37062e3186eec10ee983f5a73" },
];

// Pull a token contract address out of a mint receipt, tolerating the field
// names the faucet might use. Returns null if none present.
function mintAddress(mint) {
  if (!mint || typeof mint !== "object") return null;
  const a = mint.tokenAddress || mint.address || mint.token || mint.contractAddress;
  return a ? String(a) : null;
}

/**
 * Request a drip for `address`. Returns
 *   { claim: { claimSecret, messageLeafIndex, claimAmount }, tUSDC, tETH, tokens }
 * where `claim` is the normalized shape offscreen expects
 * (FeeJuicePaymentMethodWithClaim) and `tokens` is the list of dripped L2
 * tokens to register in the wallet ([{ symbol, address, decimals, amount }],
 * address preferring the response over the known fallback). Throws
 * Error(message) on failure.
 */
export async function requestQuetzalDrip(address, { fetchImpl = fetch, timeoutMs = QUETZAL_DRIP_TIMEOUT_MS } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let res;
  try {
    res = await fetchImpl(QUETZAL_FAUCET_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ address, captchaToken: "" }),
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
  if (!res.ok) {
    let errMsg = `HTTP ${res.status}`;
    try { const j = await res.json(); if (j?.error) errMsg = j.error; } catch {}
    throw new Error(errMsg);
  }
  const json = await res.json();
  if (!json?.success) throw new Error(json?.error || "Faucet rejected the request");
  const cd = json.claimData;
  if (!cd) throw new Error("Faucet returned no claim data");
  return {
    claim: {
      claimSecret: cd.claimSecretHex || cd.claimSecret,
      messageLeafIndex: String(cd.messageLeafIndex),
      claimAmount: String(cd.claimAmount),
    },
    tUSDC: json.tUSDCMint?.amount ? String(json.tUSDCMint.amount) : null,
    tETH: json.tETHMint?.amount ? String(json.tETHMint.amount) : null,
    // Tokens to register so their balances appear. Address prefers the faucet
    // response (self-heals across faucet token redeploys), else the known
    // fallback constant.
    tokens: QUETZAL_KNOWN_TOKENS.map((t) => {
      const mint = json[t.key];
      const address = mintAddress(mint) || t.address;
      const amount = mint && mint.amount != null ? String(mint.amount) : null;
      return { symbol: t.symbol, address, decimals: t.decimals, amount };
    }).filter((t) => t.address),
  };
}
