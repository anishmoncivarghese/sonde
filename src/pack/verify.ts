import { createHash } from "node:crypto";
import type { RepoBoundary } from "../repo/boundary.js";

export interface VerifyTarget {
  path: string;
  startByte: number;
  endByte: number;
  bodyHash: string | null;
}

export interface VerifyResult {
  bytes: Buffer;
  verified: boolean;
  hash: string;
}

/** Guarantee A: re-read and hash the exact indexed range (spec §8.1). */
export function verifySymbolBody(
  boundary: RepoBoundary,
  target: VerifyTarget,
): VerifyResult {
  const full = boundary.readFile(target.path);
  const validRange = Number.isInteger(target.startByte) &&
    Number.isInteger(target.endByte) &&
    target.startByte >= 0 &&
    target.endByte >= target.startByte &&
    target.endByte <= full.length;
  const bytes = validRange
    ? full.subarray(target.startByte, target.endByte)
    : Buffer.alloc(0);
  const hash = createHash("sha256").update(bytes).digest("hex");

  // No stored hash means there is no evidence that current bytes are the
  // indexed body. This occurs for file symbols and must degrade to metadata,
  // not silently treat readability as freshness.
  const verified = validRange &&
    target.bodyHash !== null &&
    hash === target.bodyHash;
  return { bytes, verified, hash };
}
