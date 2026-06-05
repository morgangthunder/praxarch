import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Constant-time HMAC verification shared by every inbound webhook.
 * Security-by-design: no webhook payload is processed before this passes.
 */
export function verifyHmacSignature(params: {
  payload: string | Buffer;
  signature: string | undefined;
  secret: string;
  algorithm?: "sha256" | "sha1";
  /** Some providers prefix the digest, e.g. "sha256=" (GitHub-style). */
  prefix?: string;
  encoding?: "hex" | "base64";
}): boolean {
  const { payload, signature, secret, algorithm = "sha256", prefix = "", encoding = "hex" } = params;
  if (!signature || !secret) return false;

  const expected = prefix + createHmac(algorithm, secret).update(payload).digest(encoding);

  const a = Buffer.from(expected);
  const b = Buffer.from(signature);
  // Length check first — timingSafeEqual throws on length mismatch.
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
