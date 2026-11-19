import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { get } from "@vercel/blob";
import { decryptStoredSettings } from "../settings-crypto.mjs";

const defaultCompanyId = "00000000-0000-4000-8000-000000000001";

async function readLegacySettings() {
  if (process.env.VERCEL !== "1") {
    const encrypted = await readFile(join(process.cwd(), ".gasoline", "settings.enc"), "utf8").catch((error) => {
      if (error.code === "ENOENT") return null;
      throw error;
    });
    return encrypted === null ? null : decryptStoredSettings(encrypted);
  }
  if (!process.env.BLOB_STORE_ID && !process.env.BLOB_READ_WRITE_TOKEN) return null;
  const environment = process.env.VERCEL_ENV || "production";
  const scope = environment === "preview" ? process.env.VERCEL_GIT_COMMIT_REF || "preview" : environment;
  const key = createHash("sha256").update(scope).digest("hex");
  const result = await get(`gasoline/${environment}/${key}/settings-v1.enc`, { access: "private", useCache: false });
  return result?.stream ? decryptStoredSettings(await new Response(result.stream).text()) : null;
}

/** @param {import('pg').Pool} pool */
export async function migrateLegacyCompanySettings(pool) {
  const tx = await pool.connect();
  try {
    await tx.query("BEGIN");
    await tx.query("SET LOCAL lock_timeout = '15s'");
    const { rows } = await tx.query('SELECT legacy_initialized FROM company_settings WHERE company_id = $1 FOR UPDATE', [defaultCompanyId]);
    if (!rows[0] || rows[0].legacy_initialized) {
      await tx.query("COMMIT");
      return;
    }
    const stored = await tx.query("SELECT encrypted FROM system_settings WHERE id = 'fleet'");
    const settings = stored.rows[0] ? decryptStoredSettings(stored.rows[0].encrypted) : await readLegacySettings();
    const source = settings && typeof settings === "object" ? settings : {};
    const zone = "timeZone" in source ? source.timeZone : process.env.FUEL_TIME_ZONE || "Asia/Shanghai";
    const samples = Number("baselineSamples" in source ? source.baselineSamples : process.env.FUEL_BASELINE_SAMPLES || 5);
    const multiplier = Number("anomalyMultiplier" in source ? source.anomalyMultiplier : process.env.FUEL_ANOMALY_MULTIPLIER || 1.3);
    // Invalid legacy configuration stops startup instead of silently changing historical calculations.
    if (typeof zone !== "string" || !Number.isInteger(samples) || samples < 2 || samples > 100 || !Number.isFinite(multiplier) || multiplier < 1 || multiplier > 100) {
      throw Object.assign(new Error("原有公司的业务配置无效"), { code: "LEGACY_COMPANY_SETTINGS" });
    }
    try { new Intl.DateTimeFormat("zh-CN", { timeZone: zone }); }
    catch { throw Object.assign(new Error("原有公司的业务时区无效"), { code: "LEGACY_COMPANY_SETTINGS" }); }
    await tx.query(`UPDATE company_settings SET time_zone = $2, baseline_samples = $3, anomaly_multiplier = $4,
      legacy_initialized = true, revision = gen_random_uuid(), updated_at = now() WHERE company_id = $1`, [defaultCompanyId, zone, samples, multiplier]);
    await tx.query("COMMIT");
  } catch (error) {
    await tx.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally { tx.release(); }
}
