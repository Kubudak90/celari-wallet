import { PASSKEY_STUB_TYPE, installPasskeyWalletDbShim } from "../public/src/lib/passkey-walletdb-shim.js";

// Minimal AztecAddress stand-in: only .toString() is used by the shim.
const addr = (s: string) => ({ toString: () => s } as unknown as { toString(): string });

describe("passkey-walletdb-shim", () => {
  it("returns a synthetic ecdsasecp256r1 record for a Celari-owned address (no throw)", async () => {
    const sk = { tag: "sk" };
    const salt = { tag: "salt" };
    const accountWallets = new Map<string, any>([["0xpass", { manager: {}, wallet: {}, secretKey: sk, salt }]]);
    const orig = jest.fn();
    const wallet: any = { walletDB: { retrieveAccount: orig } };

    installPasskeyWalletDbShim(wallet, accountWallets);
    const rec = await wallet.walletDB.retrieveAccount(addr("0xpass"));

    expect(rec.type).toBe(PASSKEY_STUB_TYPE); // "ecdsasecp256r1" — wire-compatible stub
    expect(rec.secretKey).toBe(sk);
    expect(rec.salt).toBe(salt);
    expect(rec.signingKey).toBeInstanceOf(Uint8Array);
    expect((rec.signingKey as Uint8Array).length).toBe(32);
    expect(orig).not.toHaveBeenCalled(); // never hits the throwing raw lookup
  });

  it("delegates to the original for unknown addresses (still throws as before)", async () => {
    const accountWallets = new Map<string, any>();
    const orig = jest.fn().mockRejectedValue(new Error('Account "0xother" does not exist on this wallet.'));
    const wallet: any = { walletDB: { retrieveAccount: orig } };

    installPasskeyWalletDbShim(wallet, accountWallets);

    await expect(wallet.walletDB.retrieveAccount(addr("0xother"))).rejects.toThrow(/does not exist on this wallet/);
    expect(orig).toHaveBeenCalledTimes(1);
  });

  it("throws if wallet.walletDB.retrieveAccount is unavailable", () => {
    expect(() => installPasskeyWalletDbShim({} as any, new Map())).toThrow(/unavailable/);
  });

  // Option C: gas-estimation must use the REAL passkey account (real P256 authwit),
  // not the empty-witness ECDSA stub, or authenticated txs fail at
  // get_auth_witness_oracle ("Expected 64 but got 0").
  it("createStubAccount routes a Celari-owned address to the real account", async () => {
    const realAccount = { tag: "real-passkey-account" };
    const accountWallets = new Map<string, any>([["0xpass", { manager: {}, wallet: {} }]]);
    const origStub = jest.fn().mockResolvedValue({ tag: "ecdsa-stub" });
    const getAccountFromAddress = jest.fn().mockResolvedValue(realAccount);
    const wallet: any = { walletDB: { retrieveAccount: jest.fn() }, accountContracts: { createStubAccount: origStub }, getAccountFromAddress };

    installPasskeyWalletDbShim(wallet, accountWallets);
    const completeAddress = { address: addr("0xpass") };
    const acct = await wallet.accountContracts.createStubAccount(completeAddress, "ecdsasecp256r1");

    expect(acct).toBe(realAccount);
    expect(getAccountFromAddress).toHaveBeenCalledWith(completeAddress.address);
    expect(origStub).not.toHaveBeenCalled(); // never builds the empty-witness stub for our account
  });

  it("createStubAccount falls through to the original stub for unknown addresses", async () => {
    const stub = { tag: "ecdsa-stub" };
    const origStub = jest.fn().mockResolvedValue(stub);
    const wallet: any = { walletDB: { retrieveAccount: jest.fn() }, accountContracts: { createStubAccount: origStub }, getAccountFromAddress: jest.fn() };

    installPasskeyWalletDbShim(wallet, new Map());
    const completeAddress = { address: addr("0xother") };
    const acct = await wallet.accountContracts.createStubAccount(completeAddress, "schnorr");

    expect(acct).toBe(stub);
    expect(origStub).toHaveBeenCalledWith(completeAddress, "schnorr");
  });
});
