pragma circom 2.1.6;

// ============================================================================
//  STRETCH GOAL — auditor-key selective disclosure.
//  Isolated from withdraw.circom so it can be cut cleanly if the schedule slips.
//  Build the base `withdraw` first; only wire this once that proves end-to-end.
// ============================================================================
//
//  Extends Withdraw with an in-circuit ElGamal encryption of (recipient, amount) under the
//  auditor's BabyJubjub public key, proving the ciphertext is HONEST (decrypts to the real values).
//
//  ElGamal on BabyJubjub (verify-known-values variant — no in-circuit discrete log):
//     C1 = r · G
//     C2 = M + r · PK      where M = encodeToPoint(recipient, amount)
//  Public: (C1.x, C1.y, C2.x, C2.y) == auditor_ct  and  auditorPk
//
//  DO NOT re-derive the EC gadgets. Lift verbatim from:
//     - circomlib/circuits/babyjub.circom, escalarmul*.circom, pointbits.circom
//     - github.com/Shigoto-dev19/ec-elgamal-circom  (encodeToMessage + encrypt)
//     - github.com/weijiekoh/elgamal-babyjub
//
//  Footgun (decide hour 1): ElGamal encrypts a POINT, not a scalar. Mapping (recipient, amount)
//  to a curve point and keeping encode/decode consistent is the 4–8h time-sink. Choose
//  "auditor verifies KNOWN values" (cheap) over "auditor recovers ARBITRARY values" (needs BSGS).

include "../node_modules/circomlib/circuits/babyjub.circom";
include "../node_modules/circomlib/circuits/escalarmulany.circom";
include "../node_modules/circomlib/circuits/bitify.circom";
include "./withdraw.circom";

template WithdrawAudit(levels) {
    // (In the full version, inline the Withdraw(levels) constraints here or instantiate it and
    //  share `recipient`/`amount`. Kept as a TODO marker to avoid a half-wired circuit.)

    // --- auditor disclosure ---
    signal input recipient;        // shared with Withdraw
    signal input amount;           // shared with Withdraw
    signal input encRandomness;    // r (private)
    signal input auditorPk[2];     // public key point (public)

    signal input auditorCt[4];     // public: [C1x, C1y, C2x, C2y]

    // TODO(stretch): encode (recipient, amount) -> point M, compute C1=r·G, C2=M+r·PK,
    // and constrain auditorCt === [C1.x, C1.y, C2.x, C2.y].
    // Left unconstrained on purpose so this file does not silently "pass" before it is finished.
}

// Intentionally NOT instantiated as `main` yet. Swap `withdraw.circom`'s main for this once done.
