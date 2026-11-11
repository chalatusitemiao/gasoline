import "server-only";

import { get } from "@vercel/blob";
import { and, eq } from "drizzle-orm";
import {
  createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, randomUUID,
} from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { getDb } from "./db";
import { systemSettingsTable } from "./db/schema";

export type SystemSettings = {
  authUrl: string;
  username: string;
  passwordHash: string;
  timeZone: string;
  baselineSamples: number;
  anomalyMultiplier: number;
};

type StoredSettings = { settings: SystemSettings; revision: string };
const settingsId = "fleet";

export class SettingsConflictError extends Error {}

export function getAuthSecret() {
  const secret = process.env.BETTER_AUTH_SECRET;
  if (!secret || secret.length < 32) throw new Error("请设置至少 32 个字符的 BETTER_AUTH_SECRET");
  return secret;
}

function settingsKey() {
  return createHmac("sha256", getAuthSecret()).update("gasoline/settings/v1").digest();
}

function encrypt(settings: SystemSettings) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", settingsKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(settings), "utf8"), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), ciphertext]).toString("base64url");
}

function decrypt(value: string): SystemSettings {
  const encrypted = Buffer.from(value, "base64url");
  const decipher = createDecipheriv("aes-256-gcm", settingsKey(), encrypted.subarray(0, 12));
  decipher.setAuthTag(encrypted.subarray(12, 28));
  const {
    authUrl, username, passwordHash, timeZone, baselineSamples, anomalyMultiplier,
  }: SystemSettings = JSON.parse(Buffer.concat([decipher.update(encrypted.subarray(28)), decipher.final()]).toString("utf8"));
  return { authUrl, username, passwordHash, timeZone, baselineSamples, anomalyMultiplier };
}

function blobPath() {
  const environment = process.env.VERCEL_ENV || "production";
  const scope = environment === "preview" ? process.env.VERCEL_GIT_COMMIT_REF || "preview" : environment;
  const key = createHash("sha256").update(scope).digest("hex");
  return `gasoline/${environment}/${key}/settings-v1.enc`;
}

export async function readStoredSettings(): Promise<StoredSettings | null> {
  const db = await getDb();
  const [record] = await db.select().from(systemSettingsTable).where(eq(systemSettingsTable.id, settingsId));
  return record ? { settings: decrypt(record.encrypted), revision: record.revision } : null;
}

export async function readLegacyStoredSettings(): Promise<SystemSettings | null> {
  if (process.env.VERCEL !== "1") {
    const file = join(process.cwd(), ".gasoline", "settings.enc");
    const encrypted = await readFile(/* turbopackIgnore: true */ file, "utf8").catch((error: unknown) => {
      if (error instanceof Error && "code" in error && error.code === "ENOENT") return null;
      throw error;
    });
    return encrypted === null ? null : decrypt(encrypted);
  }

  if (!process.env.BLOB_STORE_ID && !process.env.BLOB_READ_WRITE_TOKEN) return null;
  const result = await get(blobPath(), { access: "private", useCache: false });
  return result?.stream ? decrypt(await new Response(result.stream).text()) : null;
}

export async function writeStoredSettings(
  settings: SystemSettings,
  revision: string | null,
  transaction?: Pick<Awaited<ReturnType<typeof getDb>>, "insert" | "update">,
) {
  const db = transaction ?? await getDb();
  const values = { encrypted: encrypt(settings), revision: randomUUID() };
  if (revision === null) {
    const [inserted] = await db.insert(systemSettingsTable).values({ id: settingsId, ...values })
      .onConflictDoNothing().returning({ id: systemSettingsTable.id });
    if (!inserted) throw new SettingsConflictError();
    return;
  }

  const [updated] = await db.update(systemSettingsTable).set(values)
    .where(and(eq(systemSettingsTable.id, settingsId), eq(systemSettingsTable.revision, revision)))
    .returning({ id: systemSettingsTable.id });
  if (!updated) throw new SettingsConflictError();
}
