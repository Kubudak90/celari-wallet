#!/usr/bin/env bash
# Wrapper for aztec-nargo that runs with unlimited stack — needed for v4.2.x aztec-nr
# macros which blow the default 8MB stack during macroification.
set -euo pipefail
if [[ $PWD != ${HOME}* ]]; then
  >&2 echo "Run from within $HOME"; exit 1
fi
docker run --rm -i \
  --user $(id -u):$(id -g) \
  -v $HOME:$HOME \
  -e HOME=$HOME \
  -e RUST_MIN_STACK=536870912 \
  --ulimit stack=-1 \
  --workdir="$PWD" \
  --entrypoint=/usr/src/noir/noir-repo/target/release/nargo \
  aztecprotocol/aztec:4.2.1 "$@"
