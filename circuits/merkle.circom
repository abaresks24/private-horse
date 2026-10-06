pragma circom 2.1.6;

include "node_modules/circomlib/circuits/poseidon.circom";

// Selects (left,right) ordering from a path bit. s=0 => current is left child.
template DualMux() {
    signal input in[2];
    signal input s;
    signal output out[2];
    s * (1 - s) === 0;                 // s must be boolean
    out[0] <== (in[1] - in[0]) * s + in[0];
    out[1] <== (in[0] - in[1]) * s + in[1];
}

// Verifies that `leaf` is included under `root` given a Merkle path. Poseidon(2) per level.
// Keep LEVELS in sync with programs/sieve/src/state.rs TREE_HEIGHT.
template MerkleTreeChecker(levels) {
    signal input leaf;
    signal input root;
    signal input pathElements[levels];
    signal input pathIndices[levels];

    component selectors[levels];
    component hashers[levels];

    for (var i = 0; i < levels; i++) {
        selectors[i] = DualMux();
        selectors[i].in[0] <== (i == 0) ? leaf : hashers[i - 1].out;
        selectors[i].in[1] <== pathElements[i];
        selectors[i].s <== pathIndices[i];

        hashers[i] = Poseidon(2);
        hashers[i].inputs[0] <== selectors[i].out[0];
        hashers[i].inputs[1] <== selectors[i].out[1];
    }

    root === hashers[levels - 1].out;
}
