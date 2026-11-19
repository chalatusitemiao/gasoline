import "server-only";

import Decimal from "decimal.js";
import { count, desc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { ApiError } from "./api-error";
import { getDb } from "./db";
import { companies, companyAuditLogs, companyRenewals } from "./db/company-schema";
import { pageSchema, parse } from "./fuel-server/shared";
import type { ApiActor } from "./server-api";

export const companyRenewalSchema = z.object({
  requestId: z.uuid("无效的收款登记编号"),
  amount: z.string().trim()
    .regex(/^(?:0\.(?:0[1-9]|[1-9]\d?)|[1-9]\d{0,9}(?:\.\d{1,2})?)$/, "请输入 0.01 至 9999999999.99 元，最多保留两位小数")
    .transform((value) => new Decimal(value).toFixed(2)),
  months: z.number().int().min(1).max(120),
}).strict();

function renewalData({ id, amount, months, startsAt, endsAt, recordedAt, recordedBy }: typeof companyRenewals.$inferSelect) {
  return {
    id, amount, months, recordedBy,
    startsAt: startsAt.toISOString(),
    endsAt: endsAt.toISOString(),
    recordedAt: recordedAt.toISOString(),
  };
}

export async function listCompanyRenewals(companyId: string, query: unknown) {
  const { page, pageSize } = parse(pageSchema, query);
  const db = await getDb();
  return db.transaction(async (tx) => {
    const [company] = await tx.select({ id: companies.id }).from(companies).where(eq(companies.id, companyId));
    if (!company) throw new ApiError(404, "公司不存在");
    const where = eq(companyRenewals.companyId, companyId);
    const [summary] = await tx.select({ total: count() }).from(companyRenewals).where(where);
    const rows = await tx.select().from(companyRenewals).where(where)
      .orderBy(desc(companyRenewals.recordedAt), desc(companyRenewals.id))
      .limit(pageSize).offset((page - 1) * pageSize);
    return { items: rows.map(renewalData), total: summary.total, page, pageSize };
  }, { isolationLevel: "repeatable read", accessMode: "read only" });
}

export async function recordCompanyRenewal(companyId: string, input: z.output<typeof companyRenewalSchema>, actor: ApiActor) {
  const db = await getDb();
  return db.transaction(async (tx) => {
    const [company] = await tx.select({ paidUntil: companies.paidUntil }).from(companies)
      .where(eq(companies.id, companyId)).for("update");
    if (!company) throw new ApiError(404, "公司不存在");

    const recordedAt = new Date();
    const startsAt = company.paidUntil && company.paidUntil > recordedAt ? company.paidUntil : recordedAt;
    const endsAt = sql`((${startsAt.toISOString()}::timestamptz AT TIME ZONE 'Asia/Shanghai') + make_interval(months => ${input.months}::integer)) AT TIME ZONE 'Asia/Shanghai'`;
    const [renewal] = await tx.insert(companyRenewals).values({
      id: input.requestId,
      companyId,
      amount: input.amount,
      months: input.months,
      startsAt,
      endsAt,
      recordedAt,
      recordedBy: actor.name,
    }).onConflictDoNothing({ target: companyRenewals.id }).returning();

    if (!renewal) {
      const [existing] = await tx.select().from(companyRenewals).where(eq(companyRenewals.id, input.requestId));
      if (!existing || existing.companyId !== companyId.toLowerCase() || existing.amount !== input.amount || existing.months !== input.months) {
        throw new ApiError(409, "该收款登记编号已用于另一笔续费");
      }
      return renewalData(existing);
    }

    await tx.update(companies).set({ billingRequired: true, paidUntil: renewal.endsAt, updatedAt: recordedAt })
      .where(eq(companies.id, companyId));
    const result = renewalData(renewal);
    await tx.insert(companyAuditLogs).values({
      companyId,
      actorId: actor.id,
      actorName: actor.name,
      action: "company.renew",
      targetId: renewal.id,
      details: { previousPaidUntil: company.paidUntil?.toISOString() ?? null, ...result },
    });
    return result;
  });
}
