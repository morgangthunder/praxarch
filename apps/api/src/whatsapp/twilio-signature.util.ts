import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Validates Twilio's `X-Twilio-Signature` header.
 *
 * Twilio's scheme (distinct from a plain body HMAC): build the string by
 * concatenating the full request URL with each POST param's key+value, sorted
 * by key, then HMAC-SHA1 with the auth token and base64-encode.
 *
 * @see https://www.twilio.com/docs/usage/security#validating-requests
 */
export function validateTwilioSignature(params: {
  authToken: string;
  /** The exact public URL Twilio called (scheme+host+path+query as configured). */
  url: string;
  /** Parsed application/x-www-form-urlencoded POST params. */
  body: Record<string, string>;
  signature: string | undefined;
}): boolean {
  const { authToken, url, body, signature } = params;
  if (!signature || !authToken) return false;

  const data = Object.keys(body)
    .sort()
    .reduce((acc, key) => acc + key + body[key], url);

  const expected = createHmac("sha1", authToken).update(Buffer.from(data, "utf-8")).digest("base64");

  const a = Buffer.from(expected);
  const b = Buffer.from(signature);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
