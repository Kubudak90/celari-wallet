// extension/public/src/lib/faucet-cooldown.js
//
// Computes remaining cooldown ms given a last-faucet timestamp.

export const FAUCET_COOLDOWN_MS = 60 * 60 * 1000; // 1 hour

export function remainingCooldownMs(lastFaucetTime, now = Date.now(), cooldownMs = FAUCET_COOLDOWN_MS) {
  const last = Number(lastFaucetTime) || 0;
  return Math.max(0, (last + cooldownMs) - now);
}

export function cooldownMinutes(remainingMs) {
  return Math.ceil(remainingMs / 60000);
}
