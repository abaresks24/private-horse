#!/usr/bin/env bash
# Compile Sieve circuits to R1CS + WASM witness generators.
set -euo pipefail
cd "$(dirname "$0")/.."

mkdir -p build
for circuit in withdraw ragequit; do
  echo "▶ compiling ${circuit}.circom"
  circom "${circuit}.circom" \
    --r1cs --wasm --sym \
    -o build \
    -l node_modules
  echo "  R1CS constraints:"
  snarkjs r1cs info "build/${circuit}.r1cs" | sed 's/^/    /'
done
echo "✅ circuits compiled to ./build"
