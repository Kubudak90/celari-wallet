#!/usr/bin/env bash
# Full contract compile pipeline for Aztec v4.2.x:
#   1. nargo compile (with big stack — macros otherwise overflow default 8MB)
#   2. bb aztec_process (AVM transpile of public bytecode + verification keys)
#   3. strip __aztec_nr_internals__ prefixes (JS SDK expects unprefixed names)
#
# Requires Docker. Run from repo root.
set -euo pipefail

AZTEC_VERSION="${AZTEC_VERSION:-4.2.1}"
REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
CONTRACTS=(
  "contracts/celari_passkey_account"
  "contracts/celari_recoverable_account"
  "bridge/contracts/l2/bridged_token"
  "bridge/contracts/l2/celari_token_bridge"
)

if [[ "$REPO_ROOT" != ${HOME}* ]]; then
  echo "Repo must live under \$HOME ($HOME) — docker mounts \$HOME read-write."
  exit 1
fi

cd "$REPO_ROOT"

echo "==> Step 1: nargo compile (aztec:$AZTEC_VERSION, big stack)"
for c in "${CONTRACTS[@]}"; do
  echo "    -> $c"
  cd "$REPO_ROOT/$c"
  docker run --rm \
    --user "$(id -u):$(id -g)" \
    -v "$HOME:$HOME" \
    -e HOME="$HOME" \
    -e RUST_MIN_STACK=536870912 \
    --ulimit stack=-1 \
    --workdir="$PWD" \
    --entrypoint=/usr/src/noir/noir-repo/target/release/nargo \
    "aztecprotocol/aztec:$AZTEC_VERSION" compile
done

cd "$REPO_ROOT"

echo "==> Step 2: bb aztec_process (transpile + VK gen)"
BB_ARGS=()
for c in "${CONTRACTS[@]}"; do
  for j in "$c"/target/*.json; do
    BB_ARGS+=(-i "$j")
  done
done
docker run --rm \
  --user "$(id -u):$(id -g)" \
  -v "$HOME:$HOME" \
  -e HOME="$HOME" \
  --workdir="$PWD" \
  --entrypoint=/usr/src/barretenberg/ts/build/arm64-linux/bb \
  "aztecprotocol/aztec:$AZTEC_VERSION" \
  aztec_process "${BB_ARGS[@]}"

echo "==> Step 3: strip __aztec_nr_internals__ prefixes"
PATHS=()
for c in "${CONTRACTS[@]}"; do
  for j in "$c"/target/*.json; do
    PATHS+=("$j")
  done
done
node -e "
const fs = require('fs');
const paths = process.argv.slice(1); // node -e omits [eval] from argv
for (const p of paths) {
  const a = JSON.parse(fs.readFileSync(p, 'utf-8'));
  let n = 0;
  for (const fn of a.functions || []) {
    if (typeof fn.name === 'string' && fn.name.startsWith('__aztec_nr_internals__')) {
      fn.name = fn.name.replace(/^__aztec_nr_internals__/, '');
      n++;
    }
  }
  fs.writeFileSync(p, JSON.stringify(a, null, 2) + '\n');
  console.log('    ' + p + ': stripped ' + n);
}
" "${PATHS[@]}"

echo "==> Done. Now run: node extension/build.mjs --dev (or without --dev for prod)"
