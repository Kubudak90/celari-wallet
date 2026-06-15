// extension/public/src/lib/quetzal-faucet.js
// Single source of truth for the Quetzal faucet. One synchronous POST /api/drip
// returns Fee Juice claim data + tUSDC/tETH mint receipts (no polling).
export const QUETZAL_FAUCET_URL = "https://faucet.quetzaldex.xyz/api/drip";

// Quetzal drips run the L1 bridge + L2 mint inline; allow up to 5 min.
export const QUETZAL_DRIP_TIMEOUT_MS = 5 * 60 * 1000;

/**
 * Request a drip for `address`. Returns
 *   { claim: { claimSecret, messageLeafIndex, claimAmount }, tUSDC, tETH }
 * where `claim` is the normalized shape offscreen expects
 * (FeeJuicePaymentMethodWithClaim). Throws Error(message) on failure.
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
  };
}
