pragma circom 2.1.6;

include "node_modules/circomlib/circuits/poseidon.circom";
include "./merkle.circom";

// Ragequit proof: prove ownership of a commitment in the DEPOSIT tree WITHOUT ASP membership.
// Funds are returned to the original depositor on-chain (public exit). No recipient binding needed
// (the program forces the destination to deposit_record.depositor).
//
// Public inputs ORDER must match programs/sieve/src/instructions/ragequit.rs:
//   [rootDeposits, nullifierHash]
template Ragequit(levels) {
    signal input secret;
    signal input nullifier;
    signal input amount;
    signal input pathElements[levels];
    signal input pathIndices[levels];

    signal input rootDeposits;
    signal input nullifierHash;

    component commitmentHasher = Poseidon(3);
    commitmentHasher.inputs[0] <== secret;
    commitmentHasher.inputs[1] <== nullifier;
    commitmentHasher.inputs[2] <== amount;

    component nullifierHasher = Poseidon(1);
    nullifierHasher.inputs[0] <== nullifier;
    nullifierHash === nullifierHasher.out;

    component tree = MerkleTreeChecker(levels);
    tree.leaf <== commitmentHasher.out;
    tree.root <== rootDeposits;
    for (var i = 0; i < levels; i++) {
        tree.pathElements[i] <== pathElements[i];
        tree.pathIndices[i] <== pathIndices[i];
    }
}

component main {public [rootDeposits, nullifierHash]} = Ragequit(20);
