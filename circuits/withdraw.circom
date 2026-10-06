pragma circom 2.1.6;

include "node_modules/circomlib/circuits/poseidon.circom";
include "./merkle.circom";

// Private withdrawal proof for Sieve.
//
// Proves, without revealing WHICH deposit is yours:
//   1. commitment = Poseidon(secret, nullifier, amount)
//   2. commitment is a member of the DEPOSIT tree (root = rootDeposits)
//   3. commitment is a member of the ASP (clean-set) tree (root = rootAsp)
//   4. nullifierHash = Poseidon(nullifier)   (anti double-spend, revealed)
//   5. recipient is bound into the proof (non-malleable)
//
// Public inputs ORDER must match programs/sieve/src/instructions/withdraw.rs:
//   [rootDeposits, rootAsp, nullifierHash, recipient]
template Withdraw(levels) {
    // --- private ---
    signal input secret;
    signal input nullifier;
    signal input amount;
    signal input pathElementsDep[levels];
    signal input pathIndicesDep[levels];
    signal input pathElementsAsp[levels];
    signal input pathIndicesAsp[levels];

    // --- public ---
    signal input rootDeposits;
    signal input rootAsp;
    signal input nullifierHash;
    signal input recipient;

    // 1. commitment
    component commitmentHasher = Poseidon(3);
    commitmentHasher.inputs[0] <== secret;
    commitmentHasher.inputs[1] <== nullifier;
    commitmentHasher.inputs[2] <== amount;
    signal commitment <== commitmentHasher.out;

    // 4. nullifier hash
    component nullifierHasher = Poseidon(1);
    nullifierHasher.inputs[0] <== nullifier;
    nullifierHash === nullifierHasher.out;

    // 2. membership in the deposit tree
    component depTree = MerkleTreeChecker(levels);
    depTree.leaf <== commitment;
    depTree.root <== rootDeposits;
    for (var i = 0; i < levels; i++) {
        depTree.pathElements[i] <== pathElementsDep[i];
        depTree.pathIndices[i] <== pathIndicesDep[i];
    }

    // 3. membership in the ASP (clean) tree — the differentiator vs a plain mixer.
    component aspTree = MerkleTreeChecker(levels);
    aspTree.leaf <== commitment;
    aspTree.root <== rootAsp;
    for (var i = 0; i < levels; i++) {
        aspTree.pathElements[i] <== pathElementsAsp[i];
        aspTree.pathIndices[i] <== pathIndicesAsp[i];
    }

    // 5. bind recipient (and amount) so a relayer can't re-target the proof.
    signal recipientSq <== recipient * recipient;
    signal amountSq <== amount * amount;
}

component main {public [rootDeposits, rootAsp, nullifierHash, recipient]} = Withdraw(20);
