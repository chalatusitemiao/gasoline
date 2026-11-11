import { get, put, BlobPreconditionFailedError } from "@vercel/blob";
import {
  createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual,
} from "node:crypto";
import { mkdir, open, readFile, rename, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";

export type SystemSettings = {
  authUrl: string;
  databaseUrl: string;
  migrationDatabaseUrl: string;
  username: string;
  passwordHash: string;
  timeZone: string;
  baselineSamples: number;
  anomalyMultiplier: number;
};

type StoredSettings = { settings: SystemSettings; revision: string };

export class SettingsConflictError extends Error {}

export function getAuthSecret() {
  const secret = process.env.BETTER_AUTH_SECRET;
  if (!secret || secret.length < 32) throw new Error("请设置至少 32 个字符的 BETTER_AUTH_SECRET");
  return secret;
}

function deriveKey(purpose: string) {
  return createHmac("sha256", getAuthSecret()).update(purpose).digest();
}

export function setupCode() {
  return deriveKey("gasoline/setup/v1").toString("base64url");
}

export function matchesSetupCode(value: string) {
  const received = Buffer.from(value);
  const expected = Buffer.from(setupCode());
  return received.length === expected.length && timingSafeEqual(received, expected);
}

function encrypt(settings: SystemSettings) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", deriveKey("gasoline/settings/v1"), iv);
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(settings), "utf8"), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), ciphertext]).toString("base64url");
}

function decrypt(value: string): SystemSettings {
  const encrypted = Buffer.from(value, "base64url");
  const decipher = createDecipheriv("aes-256-gcm", deriveKey("gasoline/settings/v1"), encrypted.subarray(0, 12));
  decipher.setAuthTag(encrypted.subarray(12, 28));
  return JSON.parse(Buffer.concat([decipher.update(encrypted.subarray(28)), decipher.final()]).toString("utf8"));
}

function usesBlob() {
  return process.env.VERCEL === "1";
}

export function hasSettingsStorage() {
  return !usesBlob() || Boolean(process.env.BLOB_STORE_ID || process.env.BLOB_READ_WRITE_TOKEN);
}

function blobPath() {
  const environment = process.env.VERCEL_ENV || "production";
  const scope = environment === "preview" ? process.env.VERCEL_GIT_COMMIT_REF || "preview" : environment;
  const key = createHash("sha256").update(scope).digest("hex");
  return `gasoline/${environment}/${key}/settings-v1.enc`;
}

function diskLocation() {
  const directory = join(process.cwd(), ".gasoline");
  return { directory, file: join(directory, "settings.enc"), lock: join(directory, "settings.lock") };
}

function hasCode(error: unknown, code: string) {
  return error instanceof Error && "code" in error && error.code === code;
}

async function readDisk(file: string): Promise<StoredSettings | null> {
  const encrypted = await readFile(file, "utf8").catch((error: unknown) => {
    if (hasCode(error, "ENOENT")) return null;
    throw error;
  });
  return encrypted === null ? null : {
    settings: decrypt(encrypted),
    revision: createHash("sha256").update(encrypted).digest("hex"),
  };
}

export async function readStoredSettings(): Promise<StoredSettings | null> {
  if (!usesBlob()) return readDisk(diskLocation().file);
  if (!hasSettingsStorage()) return null;

  const result = await get(blobPath(), { access: "private", useCache: false });
  if (!result?.stream) return null;
  return {
    settings: decrypt(await new Response(result.stream).text()),
    revision: result.blob.etag,
  };
}

export async function writeStoredSettings(settings: SystemSettings, revision: string | null) {
  const encrypted = encrypt(settings);
  if (usesBlob()) {
    const pathname = blobPath();
    try {
      await put(pathname, encrypted, {
        access: "private",
        contentType: "application/octet-stream",
        ...(revision ? { allowOverwrite: true, ifMatch: revision } : {}),
      });
    } catch (error) {
      if (error instanceof BlobPreconditionFailedError ||
          (revision === null && await readStoredSettings().catch(() => null))) {
        throw new SettingsConflictError();
      }
      throw error;
    }
    return;
  }

  const { directory, file, lock } = diskLocation();
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const handle = await open(lock, "wx", 0o600).catch((error: unknown) => {
    if (hasCode(error, "EEXIST")) throw new SettingsConflictError();
    throw error;
  });
  const temporary = join(directory, `settings-${randomBytes(12).toString("hex")}.tmp`);
  try {
    if (((await readDisk(file))?.revision ?? null) !== revision) throw new SettingsConflictError();
    await writeFile(temporary, encrypted, { flag: "wx", mode: 0o600 });
    await rename(temporary, file);
  } finally {
    await handle.close();
    await Promise.all([rm(temporary, { force: true }), rm(lock, { force: true })]);
  }
}
