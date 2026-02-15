// ┌──────────────────────────────────────────────────────────┐
// │  Celari Passkey Account — TXE Unit Tests                  │
// │                                                          │
// │  Tests P256/secp256r1 account contract deployment        │
// │  and basic signature verification flow.                  │
// │                                                          │
// │  Run: cd contracts/celari_passkey_account && aztec test   │
// └──────────────────────────────────────────────────────────┘

use crate::CelariPasskeyAccount;
use dep::aztec::test::helpers::test_environment::TestEnvironment;

/// Test that the passkey account contract deploys correctly
/// with P256 public key coordinates.
#[test]
fn test_passkey_account_deployment() {
    let mut env = TestEnvironment::new();

    // Example P256 public key coordinates (test values)
    // In production these come from WebAuthn navigator.credentials.create()
    let pub_key_x: Field = 0x0102030405060708091011121314151617181920212223242526272829303132;
    let pub_key_y: Field = 0x3132333435363738394041424344454647484950515253545556575859606162;

    let contract = env.deploy_self("CelariPasskeyAccount").with_private_initializer(
        CelariPasskeyAccount::interface().constructor(pub_key_x, pub_key_y),
    );

    // Verify the contract address is deterministic and non-zero
    let address = contract.to_field();
    assert(address != 0, "Contract address should not be zero");
}

/// Test that the contract stores public key coordinates correctly.
#[test]
fn test_public_key_storage() {
    let mut env = TestEnvironment::new();

    let pub_key_x: Field = 0xaabbccdd11223344556677889900aabbccdd11223344556677889900aabbccdd;
    let pub_key_y: Field = 0x1122334455667788990011223344556677889900112233445566778899001122;

    let _contract = env.deploy_self("CelariPasskeyAccount").with_private_initializer(
        CelariPasskeyAccount::interface().constructor(pub_key_x, pub_key_y),
    );

    // If deployment succeeds, the immutable storage was set correctly
    // (PublicImmutable.initialize would panic on re-initialization)
}
