async function sha256(data: Uint8Array): Promise<Uint8Array> {
  const copy = new ArrayBuffer(data.byteLength);
  new Uint8Array(copy).set(data);
  const hash = await crypto.subtle.digest("SHA-256", copy);
  return new Uint8Array(hash);
}

export function sha256ToField(hash: Uint8Array): bigint {
  let value = BigInt(0);
  for (let i = 1; i < 32; i++) {
    value = (value << BigInt(8)) | BigInt(hash[i]);
  }
  return value;
}

export function bigintToBytes32(value: bigint): Uint8Array {
  const bytes = new Uint8Array(32);
  let v = value;
  for (let i = 31; i >= 0; i--) {
    bytes[i] = Number(v & BigInt(0xff));
    v >>= BigInt(8);
  }
  return bytes;
}

export async function generateSecretHash(): Promise<{
  secret: bigint;
  secretHash: bigint;
}> {
  const secretBytes = new Uint8Array(32);
  crypto.getRandomValues(secretBytes);
  secretBytes[0] = 0;

  let secret = BigInt(0);
  for (const byte of secretBytes) {
    secret = (secret << BigInt(8)) | BigInt(byte);
  }

  const hash = await sha256(bigintToBytes32(secret));
  const secretHash = sha256ToField(hash);

  return { secret, secretHash };
}

export function bigintToHex(value: bigint): string {
  return `0x${value.toString(16).padStart(64, "0")}`;
}
