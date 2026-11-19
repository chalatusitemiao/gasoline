import "server-only";

import { randomUUID } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { ApiError } from "./api-error";
import { getDb } from "./db";
import { companies, companyAuditLogs, companySettings } from "./db/company-schema";
import { vehicles } from "./db/fuel-schema";
import { recalculateVehicles } from "./fuel-server/calculations";
import type { ApiActor } from "./server-api";
import { isBusinessTimeZone } from "./system-settings";

export const companySettingsInput = z.object({
  timeZone: z.string().trim().max(128).refine(isBusinessTimeZone, "请选择有效的业务时区"),
  baselineSamples: z.number().int().min(2).max(100),
  anomalyMultiplier: z.number().min(1).max(100),
  revision: z.uuid("配置版本无效，请刷新页面"),
  recalculate: z.boolean().default(false),
}).strict();

export async function getCompanyBusinessSettings(companyId: string, reader?: Pick<Awaited<ReturnType<typeof getDb>>, "select">) {
  const db = reader ?? await getDb();
  const [settings] = await db.select({
    companyId: companySettings.companyId,
    companyName: companies.name,
    timeZone: companySettings.timeZone,
    baselineSamples: companySettings.baselineSamples,
    anomalyMultiplier: companySettings.anomalyMultiplier,
    revision: companySettings.revision,
    legacyInitialized: companySettings.legacyInitialized,
  }).from(companySettings).innerJoin(companies, eq(companies.id, companySettings.companyId))
    .where(and(eq(companySettings.companyId, companyId), eq(companies.isActive, true))).limit(1);
  if (!settings) throw new ApiError(403, "公司已停用或业务配置不存在");
  if (!settings.legacyInitialized) throw new ApiError(503, "默认公司的业务配置尚未完成迁移，请联系管理员");
  return {
    companyId: settings.companyId, companyName: settings.companyName, timeZone: settings.timeZone,
    baselineSamples: settings.baselineSamples, anomalyMultiplier: settings.anomalyMultiplier, revision: settings.revision,
  };
}

export async function saveCompanyBusinessSettings(input: z.output<typeof companySettingsInput>, actor: ApiActor) {
  if (actor.role !== "admin" || !actor.companyId) throw new ApiError(403, "只有公司管理员可以修改本公司的业务配置");
  const companyId = actor.companyId;
  const db = await getDb();
  return db.transaction(async (tx) => {
    // Match ledger writes so a recalculation and a concurrent import cannot interleave.
    await tx.execute(sql`select pg_advisory_xact_lock(587026491, 1)`);
    const [company] = await tx.select({ name: companies.name }).from(companies)
      .where(and(eq(companies.id, companyId), eq(companies.isActive, true))).limit(1);
    if (!company) throw new ApiError(403, "公司已停用");
    const [current] = await tx.select().from(companySettings).where(eq(companySettings.companyId, companyId)).for("update");
    if (!current?.legacyInitialized) throw new ApiError(503, "公司业务配置尚未完成初始化");
    const { revision, recalculate, ...values } = input;
    const [saved] = await tx.update(companySettings).set({ ...values, revision: randomUUID(), updatedAt: new Date() })
      .where(and(eq(companySettings.companyId, companyId), eq(companySettings.revision, revision))).returning();
    if (!saved) throw new ApiError(409, "公司业务配置已发生变化，请刷新后重试");
    if (recalculate) {
      const rows = await tx.select({ id: vehicles.id }).from(vehicles).where(eq(vehicles.companyId, companyId));
      if (rows.length) await recalculateVehicles(tx, rows.map((row) => row.id), values, companyId);
    }
    await tx.insert(companyAuditLogs).values({
      companyId, actorId: actor.id, actorName: actor.name, action: "company.settings_update", targetId: companyId,
      details: {
        before: { timeZone: current.timeZone, baselineSamples: current.baselineSamples, anomalyMultiplier: current.anomalyMultiplier },
        after: values, recalculated: recalculate,
      },
    });
    return {
      scope: "company" as const, companyId, companyName: company.name, username: actor.name, authUrl: "",
      timeZone: saved.timeZone, baselineSamples: saved.baselineSamples, anomalyMultiplier: saved.anomalyMultiplier,
      revision: saved.revision, requireLogin: false, recalculated: recalculate,
    };
  });
}
