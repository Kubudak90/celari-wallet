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
});
