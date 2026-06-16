// extension/public/src/lib/default-tokens.js
//
// Tokens Celari shows by default for every account. They are seeded once into
// the persisted custom-token list via the signature mechanism in popup.js
// (seedDefaultTokensOnce). There is NO canonical token-list registry on Aztec
// testnet — only Fee Juice is a protocol-level token; everything else is ad-hoc
// and drifts on redeploy — so this is a small per-build constant. The faucet
// drip response still overrides the Quetzal entries at runtime (see
// quetzal-faucet.js), so those self-heal across faucet token redeploys.
//
// ABI note: Fee Juice and the bridged token are NOT standard Token contracts.
// offscreen getBalances queries them via their OWN artifacts, keyed by address
// (FEE_JUICE_ADDRESS and BRIDGE.BRIDGED_TOKEN_ADDRESS) — querying them through
// the standard Token ABI would mis-register the contract (class-id mismatch)
// and/or fail the balance read. Both expose only a public balance.
import { QUETZAL_KNOWN_TOKENS } from "./quetzal-faucet.js";
import { BRIDGE } from "./bridge-config.js";

// Aztec gas token (protocol contract). This is the SDK's CANONICAL protocol
// address (getCanonicalFeeJuice().address), not a normally-deployed address —
// offscreen registers it via the canonical instance, not nodeClient.getContract.
// 18 decimals.
export const FEE_JUICE_ADDRESS = "0x0000000000000000000000000000000000000000000000000000000000000005";

export const DEFAULT_KNOWN_TOKENS = [
  ...QUETZAL_KNOWN_TOKENS.map((t) => ({ symbol: t.symbol, name: t.symbol, address: t.address, decimals: t.decimals })),
  { symbol: "FJ", name: "Fee Juice", address: FEE_JUICE_ADDRESS, decimals: 18 },
  { symbol: "BRIDGED", name: "Bridged Token", address: BRIDGE.BRIDGED_TOKEN_ADDRESS, decimals: 18 },
];
