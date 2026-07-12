import crypto from "node:crypto";

const KEY = process.env.TOKEN_ENCRYPTION_KEY;
if (!KEY || KEY.length !== 64) {
  // 64 hex chars = 32 bytes, required for AES-256
  console.warn(
    "TOKEN_ENCRYPTION_KEY is missing or not a 32-byte hex string. " +
      "Generate one with: openssl rand -hex 32"
  );
}

const ALGO = "aes-256-gcm";

/** Encrypt a token before storing it in the DB. Never store tokens in plaintext. */
export function encryptToken(plaintext) {
  const iv = crypto.randomBytes(12);
  const key = Buffer.from(KEY, "hex");
  const cipher = crypto.createCipheriv(ALGO, key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  // pack iv + authTag + ciphertext together, base64
  return Buffer.concat([iv, authTag, encrypted]).toString("base64");
}

/** Decrypt a token read from the DB, right before using it in an API call. */
export function decryptToken(packed) {
  const buf = Buffer.from(packed, "base64");
  const iv = buf.subarray(0, 12);
  const authTag = buf.subarray(12, 28);
  const encrypted = buf.subarray(28);
  const key = Buffer.from(KEY, "hex");
  const decipher = crypto.createDecipheriv(ALGO, key, iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString("utf8");
}
