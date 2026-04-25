import { L1Client } from "./sdk/l1-client";
import { generateSecretHash, bigintToHex } from "./sdk/content-hash";
import { PORTAL_ADDRESS, SEPOLIA_RPC_URL } from "./constants";

let l1ClientInstance: L1Client | null = null;

export function getL1Client(): L1Client {
  if (!l1ClientInstance) {
    l1ClientInstance = new L1Client({
      rpcUrl: SEPOLIA_RPC_URL,
      portalAddress: PORTAL_ADDRESS,
    });
  }
  return l1ClientInstance;
}

export async function generateSecret() {
  const { secret, secretHash } = await generateSecretHash();
  return {
    secret: bigintToHex(secret),
    secretHash: bigintToHex(secretHash),
  };
}
