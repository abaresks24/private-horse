#!/usr/bin/env bash
# Groth16 trusted setup (hackathon-grade, single-party) + export verifying keys to Rust.
set -euo pipefail
cd "$(dirname "$0")/.."

PTAU=build/pot16_final.ptau

# Powers of Tau (phase 1). bn128, up to 2^16 constraints — bump if r1cs info says you need more.
if [ ! -f "$PTAU" ]; then
  echo "▶ powers of tau (phase 1)"
  snarkjs powersoftau new bn128 16 build/pot16_0000.ptau -v
  echo "sieve-entropy-$(date +%s)" | snarkjs powersoftau contribute build/pot16_0000.ptau build/pot16_0001.ptau --name="sieve" -v
  snarkjs powersoftau prepare phase2 build/pot16_0001.ptau "$PTAU" -v
fi

for circuit in withdraw ragequit; do
  echo "▶ groth16 setup: ${circuit}"
  snarkjs groth16 setup "build/${circuit}.r1cs" "$PTAU" "build/${circuit}_0000.zkey"
  echo "sieve-$(date +%s)" | snarkjs zkey contribute "build/${circuit}_0000.zkey" "build/${circuit}_final.zkey" --name="sieve" -v
  snarkjs zkey export verificationkey "build/${circuit}_final.zkey" "build/${circuit}_vk.json"
done

echo "▶ exporting verifying keys to Rust (programs/sieve/src/verifying_key.rs)"
node scripts/parse_vk_to_rust.js \
  build/withdraw_vk.json build/ragequit_vk.json \
  ../programs/sieve/src/verifying_key.rs

echo "✅ setup done. zkeys + vkeys in ./build, Rust VK regenerated."
