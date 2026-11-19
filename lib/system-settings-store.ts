import "server-only";

import { get } from "@vercel/blob";
import { and, eq } from "drizzle-orm";
import { createHash, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { getDb } from "./db";
import { systemSettingsTable } from "./db/schema";
import { decryptStoredSettings, encryptStoredSettings as encrypt } from "./settings-crypto.mjs";

export { getAuthSecret } from "./settings-crypto.mjs";

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

function decrypt(value: string): SystemSettings {
  const {
    authUrl, username, passwordHash, timeZone, baselineSamples, anomalyMultiplier,
  } = decryptStoredSettings(value) as SystemSettings;
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
