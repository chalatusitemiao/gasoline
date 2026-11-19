import { createCipheriv, createDecipheriv, createHmac, randomBytes } from "node:crypto";

export function getAuthSecret() {
  const secret = process.env.BETTER_AUTH_SECRET;
  if (!secret || secret.length < 32) throw new Error("请设置至少 32 个字符的 BETTER_AUTH_SECRET");
  return secret;
}

function settingsKey() {
  return createHmac("sha256", getAuthSecret()).update("gasoline/settings/v1").digest();
}

/** @param {unknown} settings */
export function encryptStoredSettings(settings) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", settingsKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(settings), "utf8"), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), ciphertext]).toString("base64url");
}

/** @param {string} value @returns {unknown} */
export function decryptStoredSettings(value) {
  const encrypted = Buffer.from(value, "base64url");
  const decipher = createDecipheriv("aes-256-gcm", settingsKey(), encrypted.subarray(0, 12));
  decipher.setAuthTag(encrypted.subarray(12, 28));
  return JSON.parse(Buffer.concat([decipher.update(encrypted.subarray(28)), decipher.final()]).toString("utf8"));
}
