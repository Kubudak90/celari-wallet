// Verify every named import our extension code uses against installed Aztec v4.2.0
const checks = [
  ["@aztec/wallets/embedded", ["EmbeddedWallet"]],
  ["@aztec/aztec.js/node", ["createAztecNodeClient"]],
  ["@aztec/aztec.js/fields", ["Fr"]],
  ["@aztec/aztec.js/addresses", ["AztecAddress"]],
  ["@aztec/accounts/defaults", ["DefaultAccountContract"]],
  ["@aztec/stdlib/auth-witness", ["AuthWitness"]],
  ["@aztec/aztec.js/fee/testing", ["SponsoredFeePaymentMethod"]],
  ["@aztec/aztec.js/account", ["NO_FROM"]],
  ["@aztec/stdlib/contract", ["getContractInstanceFromInstantiationParams"]],
  ["@aztec/aztec.js/abi", ["loadContractArtifact"]],
  ["@aztec/aztec.js/contracts", ["Contract"]],
  ["@aztec/foundation/json-rpc", ["jsonStringify"]],
  ["@aztec/aztec.js/wallet", ["WalletSchema", "AccountManager"]],
  ["@aztec/stdlib/keys", ["deriveKeys"]],
  ["@aztec/noir-contracts.js/SponsoredFPC", ["SponsoredFPCContract"]],
  ["@aztec/pxe/client/lazy", ["createPXE", "getPXEConfig"]],
  ["@aztec/bb.js", ["Barretenberg", "BackendType"]],
  ["@aztec/noir-contracts.js/Token", ["TokenContract"]],
  ["@aztec/aztec.js/fee", ["FeeJuicePaymentMethodWithClaim"]],
  ["@aztec/stdlib/gas", ["GasSettings"]],
  ["@aztec/aztec.js", ["AztecAddress", "Fr"]],
  ["@aztec/protocol-contracts/fee-juice", ["getCanonicalFeeJuice"]],
  ["@aztec/simulator/client", ["WASMSimulator"]],
  ["@aztec/bb-prover/client/lazy", ["BBLazyPrivateKernelProver"]],
  ["@aztec/noir-contracts.js/NFT", ["NFTContract"]],
];

let bad = 0;
const loaded = {};
for (const [mod, names] of checks) {
  try {
    const m = await import(mod);
    loaded[mod] = m;
    for (const n of names) {
      if (!(n in m)) { console.log(`MISSING  ${mod} :: ${n}`); bad++; }
    }
  } catch (e) {
    console.log(`LOAD-FAIL ${mod} :: ${(e?.message || e).toString().slice(0,140)}`);
    bad++;
  }
}
console.log(`\n${bad === 0 ? "✓ all imports resolve" : `✗ ${bad} issue(s)`}`);

// Spot-check static methods + class shapes for things known to drift
function dumpStatics(name, cls, candidates) {
  console.log(`\n${name} statics:`);
  for (const m of candidates) {
    console.log(`  ${m}: ${typeof cls?.[m]}`);
  }
}

if (loaded["@aztec/stdlib/gas"]) {
  dumpStatics("GasSettings", loaded["@aztec/stdlib/gas"].GasSettings,
    ["default", "fallback", "forEstimation", "empty", "from", "fromPlainObject"]);
}

if (loaded["@aztec/aztec.js/wallet"]) {
  console.log("\n@aztec/aztec.js/wallet exports:", Object.keys(loaded["@aztec/aztec.js/wallet"]).join(", "));
  const ws = loaded["@aztec/aztec.js/wallet"].WalletSchema;
  if (ws) console.log("WalletSchema methods:", Object.keys(ws).slice(0, 40).join(", "));
}

if (loaded["@aztec/aztec.js/fee"]) {
  console.log("\n@aztec/aztec.js/fee exports:", Object.keys(loaded["@aztec/aztec.js/fee"]).join(", "));
}

if (loaded["@aztec/wallets/embedded"]) {
  const EW = loaded["@aztec/wallets/embedded"].EmbeddedWallet;
  console.log("\nEmbeddedWallet prototype keys:", Object.getOwnPropertyNames(EW?.prototype || {}).slice(0, 30).join(", "));
}

if (loaded["@aztec/aztec.js/account"]) {
  console.log("\n@aztec/aztec.js/account exports:", Object.keys(loaded["@aztec/aztec.js/account"]).join(", "));
  console.log("NO_FROM value:", loaded["@aztec/aztec.js/account"].NO_FROM);
}

if (loaded["@aztec/pxe/client/lazy"]) {
  console.log("\n@aztec/pxe/client/lazy exports:", Object.keys(loaded["@aztec/pxe/client/lazy"]).join(", "));
}

// PXE method drift — our code calls these on `wallet.pxe`
console.log("\nPXE interface declared methods we depend on:");
const pxeInterfacePath = await import("node:fs").then(fs => fs.promises.readFile(
  "node_modules/@aztec/stdlib/dest/interfaces/pxe.d.ts", "utf8").catch(() => null));
if (pxeInterfacePath) {
  const wanted = ["getNotes", "registerContract", "simulateTx", "sendTx", "getPublicEvents", "getBlockNumber", "getContractClassMetadata"];
  for (const w of wanted) {
    const has = new RegExp(`\\b${w}\\s*[(<:]`).test(pxeInterfacePath);
    console.log(`  ${w}: ${has ? "OK" : "MISSING"}`);
  }
}
