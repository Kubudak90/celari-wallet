// GET /api/status?rid=...
// Returns the current state of a recovery request.
//
// Response: {
//   accountAddress: string,
//   approvedCount: number,
//   threshold: number,
//   thresholdMet: boolean,
//   guardianKeys: string[] (only when threshold met),
//   newPubKeyX: string,
//   newPubKeyY: string,
//   createdAt: number,
//   expiresAt: number,
// }

import type { VercelRequest, VercelResponse } from "@vercel/node";
import crypto from "crypto";
import { getRecovery } from "./_redis";

/** Constant-time string compare; false on any length/format mismatch. */
function safeEqual(a: unknown, b: unknown): boolean {
  if (typeof a !== "string" || typeof b !== "string") return false;
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ba.length !== bb.length) return false;
  return crypto.timingSafeEqual(ba, bb);
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { rid, initiatorToken } = req.query;

  if (!rid) {
    return res.status(400).json({ error: "Missing recoveryId" });
  }

  const recovery = await getRecovery(rid as string);
  if (!recovery) {
    return res.status(404).json({ error: "Recovery not found or expired" });
  }

  const approvedCount = recovery.guardians.filter((g) => g.approved).length;
  const thresholdMet = approvedCount >= recovery.threshold;

  const response: Record<string, unknown> = {
    accountAddress: recovery.accountAddress,
    approvedCount,
    threshold: recovery.threshold,
    thresholdMet,
    newPubKeyX: recovery.newPubKeyX,
    newPubKeyY: recovery.newPubKeyY,
    createdAt: recovery.createdAt,
    expiresAt: recovery.createdAt + 24 * 60 * 60 * 1000,
  };

  // Aggregated guardian secrets are the bearer credential for the on-chain
  // takeover. NEVER serve them on the bare recoveryId — that lets a single
  // guardian (who already holds the rid via their approval email) harvest the
  // others' keys once threshold is met. Release ONLY to the original initiating
  // device, which presents the initiatorToken it received from /api/initiate.
  if (thresholdMet && safeEqual(initiatorToken, recovery.initiatorToken)) {
    response.guardianKeys = recovery.guardians
      .filter((g) => g.approved && g.guardianKey)
      .map((g) => g.guardianKey);
  }

  return res.status(200).json(response);
}
