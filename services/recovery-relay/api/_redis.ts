import { Redis } from "@upstash/redis";

const redis = Redis.fromEnv();

const TTL_SECONDS = 24 * 60 * 60; // 24 hours

export interface RecoveryData {
  accountAddress: string;
  newPubKeyX: string;
  newPubKeyY: string;
  guardians: {
    email: string;
    index: number;
    token: string;
    approved: boolean;
    guardianKey?: string;
  }[];
  createdAt: number;
  threshold: number;
  // Secret returned ONLY to the device that initiated the recovery. The
  // aggregated guardian keys are released by /api/status only when this token is
  // presented, so a single guardian (who holds only their own approval token)
  // can never harvest the other guardians' secrets and unilaterally take over.
  initiatorToken: string;
}

function key(id: string) {
  return `recovery:${id}`;
}

export async function getRecovery(id: string): Promise<RecoveryData | null> {
  return redis.get<RecoveryData>(key(id));
}

export async function setRecovery(id: string, data: RecoveryData): Promise<void> {
  await redis.set(key(id), data, { ex: TTL_SECONDS });
}

/**
 * Fixed-window rate limiter backed by Redis INCR. Returns true if the caller is
 * allowed (count within `limit` over `windowSeconds`), false if throttled.
 * Used to stop unauthenticated abuse of /api/initiate (spam, email/quota burn).
 */
export async function rateLimit(
  bucket: string,
  limit: number,
  windowSeconds: number,
): Promise<boolean> {
  const k = `rl:${bucket}`;
  const count = await redis.incr(k);
  if (count === 1) {
    await redis.expire(k, windowSeconds);
  }
  return count <= limit;
}
