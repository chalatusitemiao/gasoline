import "server-only";

import { randomUUID } from "node:crypto";
import Decimal from "decimal.js";
import { and, asc, count, desc, eq, gte, ilike, inArray, lte, or, sql } from "drizzle-orm";
import { z } from "zod";
import { companyBillingStatus } from "./company-access";
import { getDb } from "./db";
import { companies, companyAuditLogs, companySettings } from "./db/company-schema";
import { drivers, fuelRecords, vehicles } from "./db/fuel-schema";
import { session, user, userCredential } from "./db/schema";
import { normalizeUsername, userEmail } from "./fuel-credentials";
import { fuelDateSchema } from "./fuel";
import { keywordSchema, pageSchema, parse, searchPattern } from "./fuel-server/shared";
import { usernameSchema } from "./login-contract";
import { ApiError, type ApiActor } from "./server-api";
import { hashSettingsPassword } from "./system-settings";

const textField = (max: number) => z.string().trim().max(max).refine((value) => !value.includes("\u0000"), "内容包含无效字符");
const companyFields = {
  name: textField(120).min(1, "请输入公司名称"),
  contactName: textField(80).default(""),
  contactPhone: textField(32).regex(/^[+\d\s()-]*$/, "请输入有效联系电话").default(""),
  notes: textField(500).default(""),
};
export const createCompanySchema = z.object({
  ...companyFields,
  adminUsername: usernameSchema,
  adminPassword: z.string().min(8, "密码至少需要 8 位").max(1024),
}).strict();
export const updateCompanySchema = z.object({
  ...companyFields,
  isActive: z.boolean().optional(),
  suspendOnExpiry: z.boolean().optional(),
}).strict();
const listFilter = pageSchema.extend({ keyword: keywordSchema });

// Keep the outer company reference qualified inside correlated subqueries.
const outerCompanyId = sql`${sql.identifier("companies")}.${sql.identifier("id")}`;
const accountCount = sql<number>`(select count(*)::integer from ${user} where ${user.companyId} = ${outerCompanyId})`;
const adminCount = sql<number>`(select count(*)::integer from ${user} where ${user.companyId} = ${outerCompanyId} and ${user.role} = 'admin' and ${user.isActive})`;
const companySelection = {
  id: companies.id, code: companies.code, name: companies.name,
  contactName: companies.contactName, contactPhone: companies.contactPhone, notes: companies.notes,
  isActive: companies.isActive, billingRequired: companies.billingRequired, paidUntil: companies.paidUntil,
  suspendOnExpiry: companies.suspendOnExpiry,
  createdAt: companies.createdAt, updatedAt: companies.updatedAt,
  accountCount, adminCount,
};

function companyData<T extends { billingRequired: boolean; paidUntil: Date | null; createdAt: Date; updatedAt: Date }>(row: T, now = new Date()) {
  const { billingRequired, paidUntil, createdAt, updatedAt, ...fields } = row;
  return {
    ...fields,
    billingStatus: companyBillingStatus(billingRequired, paidUntil, now),
    paidUntil: paidUntil?.toISOString() ?? null,
    createdAt: createdAt.toISOString(),
    updatedAt: updatedAt.toISOString(),
  };
}

function conflict(error: unknown): never {
  for (let cause = error; cause && typeof cause === "object"; cause = "cause" in cause ? cause.cause : undefined) {
    if ("code" in cause && cause.code === "23505") throw new ApiError(409, "账号名称或公司编号已存在");
  }
  throw error;
}

export async function listCompanies(query: unknown) {
  const { keyword, page, pageSize } = parse(listFilter, query);
  const where = keyword ? or(ilike(companies.name, searchPattern(keyword)), ilike(companies.code, searchPattern(keyword)), ilike(companies.contactName, searchPattern(keyword))) : undefined;
  const db = await getDb();
  return db.transaction(async (tx) => {
    const [summary] = await tx.select({ total: count() }).from(companies).where(where);
    const rows = await tx.select(companySelection).from(companies).where(where)
      .orderBy(asc(companies.createdAt), asc(companies.id)).limit(pageSize).offset((page - 1) * pageSize);
    const now = new Date();
    return { items: rows.map((row) => companyData(row, now)), total: summary.total, page, pageSize };
  }, { isolationLevel: "repeatable read", accessMode: "read only" });
}

export async function createCompany(input: z.output<typeof createCompanySchema>, actor: ApiActor) {
  const passwordHash = await hashSettingsPassword(input.adminPassword);
  const db = await getDb();
  try {
    return await db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(1662806122, 2)`);
      const id = randomUUID();
      const { adminUsername } = input;
      const fields = { name: input.name, contactName: input.contactName, contactPhone: input.contactPhone, notes: input.notes };
      const [company] = await tx.insert(companies).values({ ...fields, id, code: `C${id.replaceAll("-", "").toUpperCase()}` }).returning();
      const accountId = randomUUID();
      await tx.insert(user).values({
        id: accountId, name: adminUsername.trim(), username: normalizeUsername(adminUsername),
        email: userEmail(adminUsername), role: "admin", companyId: id, isActive: true,
      });
      await tx.insert(userCredential).values({ userId: accountId, passwordHash });
      await tx.insert(companySettings).values({ companyId: id });
      await tx.insert(companyAuditLogs).values({
        companyId: id, actorId: actor.id, actorName: actor.name, action: "company.create", targetId: id,
        details: { name: fields.name, adminUserId: accountId, adminUsername },
      });
      return companyData({ ...company, accountCount: 1, adminCount: 1 });
    });
  } catch (error) { conflict(error); }
}

export async function updateCompany(id: string, input: z.output<typeof updateCompanySchema>, actor: ApiActor) {
  const db = await getDb();
  return db.transaction(async (tx) => {
    // Use the same lock as account management, so company state and administrator changes serialize.
    await tx.execute(sql`select pg_advisory_xact_lock(1662806122, 2)`);
    const [current] = await tx.select().from(companies).where(eq(companies.id, id)).for("update");
    if (!current) throw new ApiError(404, "公司不存在");
    const fields = {
      ...input,
      isActive: input.isActive ?? current.isActive,
      suspendOnExpiry: input.suspendOnExpiry ?? current.suspendOnExpiry,
    };
    const [updated] = await tx.update(companies).set({ ...fields, updatedAt: new Date() })
      .where(eq(companies.id, id)).returning();
    if (!updated.isActive) {
      await tx.delete(session).where(inArray(session.userId, tx.select({ id: user.id }).from(user).where(eq(user.companyId, id))));
    }
    await tx.insert(companyAuditLogs).values({
      companyId: id, actorId: actor.id, actorName: actor.name,
      action: current.isActive !== updated.isActive ? updated.isActive ? "company.enable" : "company.disable" : "company.update",
      targetId: id,
      details: {
        before: { name: current.name, contactName: current.contactName, contactPhone: current.contactPhone, notes: current.notes, isActive: current.isActive, suspendOnExpiry: current.suspendOnExpiry },
        after: fields,
      },
    });
    const [counts] = await tx.select({ accountCount, adminCount }).from(companies).where(eq(companies.id, id));
    return companyData({ ...updated, ...counts });
  });
}

const summaryFilter = z.object({ from: fuelDateSchema.optional(), to: fuelDateSchema.optional(), companyId: z.uuid().optional() })
  .refine(({ from, to }) => !from || !to || from <= to, "开始日期不能晚于结束日期");

export async function getPlatformSummary(query: unknown) {
  const { from, to, companyId } = parse(summaryFilter, query);
  const db = await getDb();
  return db.transaction(async (tx) => {
    const companyRows = await tx.select({
      companyId: companies.id, companyCode: companies.code, companyName: companies.name,
      isActive: companies.isActive, accountCount,
      vehicleCount: sql<number>`(select count(*)::integer from ${vehicles} where ${vehicles.companyId} = ${outerCompanyId})`,
      driverCount: sql<number>`(select count(*)::integer from ${drivers} where ${drivers.companyId} = ${outerCompanyId})`,
    }).from(companies).where(companyId ? eq(companies.id, companyId) : undefined).orderBy(asc(companies.code));
    if (companyId && !companyRows.length) throw new ApiError(404, "公司不存在");
    const metrics = await tx.select({
      companyId: fuelRecords.companyId,
      recordCount: sql<number>`count(*)::integer`,
      totalLiters: sql<string>`coalesce(sum(${fuelRecords.liters}), 0)::text`,
      totalAmount: sql<string>`coalesce(sum(${fuelRecords.amount}), 0)::text`,
      anomalyCount: sql<number>`(count(*) filter (where ${fuelRecords.isAnomaly}))::integer`,
    }).from(fuelRecords).where(and(
      companyId ? eq(fuelRecords.companyId, companyId) : undefined,
      from ? gte(fuelRecords.date, from) : undefined,
      to ? lte(fuelRecords.date, to) : undefined,
    )).groupBy(fuelRecords.companyId);
    const metricMap = new Map(metrics.map((row) => [row.companyId, row]));
    const items = companyRows.map((company) => ({
      ...company, recordCount: 0, totalLiters: "0.000", totalAmount: "0.00", anomalyCount: 0,
      ...metricMap.get(company.companyId),
    }));
    const SumDecimal = Decimal.clone({ precision: 40, rounding: Decimal.ROUND_HALF_UP });
    const total = items.reduce((sum, item) => ({
      companyCount: sum.companyCount + 1, accountCount: sum.accountCount + item.accountCount,
      vehicleCount: sum.vehicleCount + item.vehicleCount, driverCount: sum.driverCount + item.driverCount,
      recordCount: sum.recordCount + item.recordCount, anomalyCount: sum.anomalyCount + item.anomalyCount,
      totalLiters: new SumDecimal(sum.totalLiters).plus(item.totalLiters).toFixed(3),
      totalAmount: new SumDecimal(sum.totalAmount).plus(item.totalAmount).toFixed(2),
    }), { companyCount: 0, accountCount: 0, vehicleCount: 0, driverCount: 0, recordCount: 0, anomalyCount: 0, totalLiters: "0.000", totalAmount: "0.00" });
    return { from: from ?? null, to: to ?? null, items, total };
  }, { isolationLevel: "repeatable read", accessMode: "read only" });
}

export async function listCompanyAuditLogs(query: unknown) {
  const { companyId, page, pageSize } = parse(pageSchema.extend({ companyId: z.uuid().optional() }), query);
  const db = await getDb();
  const where = companyId ? eq(companyAuditLogs.companyId, companyId) : undefined;
  return db.transaction(async (tx) => {
    const [summary] = await tx.select({ total: count() }).from(companyAuditLogs).where(where);
    const rows = await tx.select().from(companyAuditLogs).where(where).orderBy(desc(companyAuditLogs.createdAt), desc(companyAuditLogs.id))
      .limit(pageSize).offset((page - 1) * pageSize);
    return { items: rows.map((row) => ({ ...row, createdAt: row.createdAt.toISOString() })), total: summary.total, page, pageSize };
  }, { isolationLevel: "repeatable read", accessMode: "read only" });
}
