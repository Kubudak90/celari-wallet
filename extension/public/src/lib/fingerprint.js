// extension/public/src/lib/fingerprint.js
// Render a session verificationHash (hex string) as a short, stable emoji
// fingerprint the user can eye-compare to detect a hijacked provider session.
const EMOJI = [
  "🦊","🐼","🦁","🐸","🐧","🦉","🐙","🦋","🌵","🍄","🌙","⭐","🔥","💧","🍀","🎲",
  "🎸","🚀","⚓","🔑","🎩","🧊","🍕","🌈","🐝","🐳","🦄","🌻","⚡","❄","🎯","🧩",
];

export function verificationFingerprint(hash) {
  const hex = String(hash || "").replace(/[^0-9a-fA-F]/g, "") || "0";
  let out = "";
  for (let i = 0; i < 4; i++) {
    // Take a 2-hex-char window (wrapping) → byte → emoji index.
    const start = (i * 2) % Math.max(hex.length, 1);
    const pair = (hex.slice(start, start + 2) || hex.slice(0, 2) || "0").padEnd(2, "0");
    const byte = parseInt(pair, 16) || 0;
    out += EMOJI[byte % EMOJI.length];
  }
  return out;
}
