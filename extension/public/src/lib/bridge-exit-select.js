// extension/public/src/lib/bridge-exit-select.js
// Pick the L2 exit mode for a withdraw: private if the private balance covers
// the amount, else public if the public balance does, else null (insufficient).
export function selectExitMode(privateBal, publicBal, amount) {
  const amt = BigInt(amount);
  if (BigInt(privateBal) >= amt) return "private";
  if (BigInt(publicBal) >= amt) return "public";
  return null;
}
