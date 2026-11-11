import "server-only";

import { randomBytes } from "node:crypto";
import { Client } from "pg";
import { z } from "zod";
import { migrateDatabase } from "./db/migrate";
import { ApiError } from "./server-api";
import { hashSettingsPassword, isBusinessTimeZone, type SystemSettings } from "./system-settings";
import { hasSettingsStorage, SettingsConflictError, writeStoredSettings } from "./system-settings-store";

function validUrl(value: string, protocols: string[]) {
  if (!value) return true;
  try {
    const url = new URL(value);
    return Boolean(url.hostname) && protocols.includes(url.protocol);
  } catch {
    return false;
  }
}

const databaseUrl = z.string().trim().max(4096)
  .refine((value) => validUrl(value, ["postgres:", "postgresql:"]), "请填写有效的 PostgreSQL 连接串");

export const settingsInput = z.object({
  authUrl: z.string().trim().max(2048)
    .refine((value) => validUrl(value, ["http:", "https:"]), "站点地址必须是 HTTP 或 HTTPS 地址"),
  databaseUrl: databaseUrl.optional(),
  migrationDatabaseUrl: databaseUrl.optional(),
  clearMigrationDatabaseUrl: z.boolean().optional(),
  username: z.string().trim().min(1, "请填写后台用户名").max(128),
  password: z.string().max(1024).optional(),
  timeZone: z.string().trim().max(128).refine(isBusinessTimeZone, "请选择有效的业务时区"),
  baselineSamples: z.number().int().min(2).max(100),
  anomalyMultiplier: z.number().min(1).max(100),
});

export const setupInput = settingsInput.extend({ setupSecret: z.string().trim().min(1).max(128) });

export function settingsView(settings: SystemSettings) {
  return {
    authUrl: settings.authUrl,
    databaseUrlConfigured: Boolean(settings.databaseUrl),
    migrationDatabaseUrlConfigured: Boolean(settings.migrationDatabaseUrl),
    username: settings.username,
    timeZone: settings.timeZone,
    baselineSamples: settings.baselineSamples,
    anomalyMultiplier: settings.anomalyMultiplier,
  };
}

async function verifyMigrationTarget(client: Client, connectionString: string) {
  const migration = new Client({ connectionString, connectionTimeoutMillis: 5_000, query_timeout: 5_000 });
  const probe = randomBytes(8).readBigInt64BE().toString();
  try {
    await migration.connect();
    await client.query("BEGIN");
    // A transaction lock is visible only to other connections to this database.
    await client.query("SELECT pg_advisory_xact_lock($1::bigint)", [probe]);
    const { rows } = await migration.query<{ sameDatabase: boolean }>(
      'SELECT NOT pg_try_advisory_xact_lock($1::bigint) AS "sameDatabase"', [probe],
    );
    if (!rows[0]?.sameDatabase) {
      throw new ApiError(400, "应用连接与迁移直连必须指向同一个数据库");
    }
  } finally {
    await migration.end();
  }
}

async function inspectDatabase(
  connectionString: string,
  timeZone: string,
  { verifySchema = false, migrationConnectionString = "" } = {},
) {
  const client = new Client({ connectionString, connectionTimeoutMillis: 5_000, query_timeout: 5_000 });
  try {
    await client.connect();
    await client.query("SELECT current_timestamp AT TIME ZONE $1", [timeZone]);
    if (verifySchema) {
      await client.query("SELECT 1 FROM users, sessions, login_attempts, vehicles, drivers, fuel_records, fuel_changes, fuel_deletions LIMIT 0");
    }
    if (migrationConnectionString && migrationConnectionString !== connectionString) {
      await verifyMigrationTarget(client, migrationConnectionString);
    }
  } finally {
    await client.end();
  }
}

export async function saveSystemSettings(
  input: z.infer<typeof settingsInput>,
  current: SystemSettings,
  revision: string | null,
  setup = false,
) {
  if (!hasSettingsStorage()) throw new ApiError(503, "请先为 Vercel 项目关联私有 Blob 存储");
  const connectionString = input.databaseUrl || current.databaseUrl;
  if (!connectionString) throw new ApiError(400, "请填写 PostgreSQL 连接串");
  if (!input.password && !current.passwordHash) throw new ApiError(400, "请设置后台登录密码");

  const databaseChanged = connectionString !== current.databaseUrl;
  const migrationConnectionString = input.clearMigrationDatabaseUrl ? "" :
    input.migrationDatabaseUrl || (databaseChanged ? "" : current.migrationDatabaseUrl);
  const settings: SystemSettings = {
    authUrl: input.authUrl ? new URL(input.authUrl).origin : "",
    databaseUrl: connectionString,
    migrationDatabaseUrl: migrationConnectionString,
    username: input.username,
    passwordHash: input.password ? await hashSettingsPassword(input.password) : current.passwordHash,
    timeZone: input.timeZone,
    baselineSamples: input.baselineSamples,
    anomalyMultiplier: input.anomalyMultiplier,
  };

  if (setup || databaseChanged || current.migrationDatabaseUrl !== migrationConnectionString || current.timeZone !== settings.timeZone) {
    try {
      await inspectDatabase(connectionString, settings.timeZone, { migrationConnectionString });
      if (setup || databaseChanged) await migrateDatabase(migrationConnectionString || connectionString);
      await inspectDatabase(connectionString, settings.timeZone, { verifySchema: true });
    } catch (error) {
      if (error instanceof ApiError) throw error;
      throw new ApiError(400, "数据库检查或迁移失败，请核对连接串、权限和业务时区");
    }
  }

  try {
    await writeStoredSettings(settings, revision);
  } catch (error) {
    if (error instanceof SettingsConflictError) {
      throw new ApiError(409, "系统设置已发生变化，请刷新后重试");
    }
    throw error;
  }

  return {
    ...settingsView(settings),
    requireLogin: databaseChanged || settings.authUrl !== current.authUrl ||
      settings.username !== current.username || settings.passwordHash !== current.passwordHash,
  };
}
