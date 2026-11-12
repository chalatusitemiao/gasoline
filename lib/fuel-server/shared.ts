import "server-only";

import { sql } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/lib/db";
import { FUEL_PAGE_SIZE } from "@/lib/fuel";
import { ApiError } from "@/lib/server-api";

export type FuelActor = { id: string; name: string };
type FuelDb = Awaited<ReturnType<typeof getDb>>;
export type FuelTx = Parameters<Parameters<FuelDb["transaction"]>[0]>[0];
export type FuelReadDb = Pick<FuelDb, "select">;

export async function writeFuel<T>(action: (tx: FuelTx) => Promise<T>) {
  const db = await getDb();
  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(587026491, 1)`);
    return action(tx);
  });
}

export async function readFuel<T>(action: (tx: FuelTx) => Promise<T>) {
  const db = await getDb();
  return db.transaction(action, {
    isolationLevel: "repeatable read",
    accessMode: "read only",
  });
}

export function parse<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success) {
    throw new ApiError(400, result.error.issues[0]?.message ?? "请求参数有误");
  }
  return result.data;
}

export async function body<T>(request: Request, schema: z.ZodType<T>, optional = false) {
  let value: unknown;
  try {
    const content = await request.text();
    value = optional && content === "" ? {} : JSON.parse(content);
  } catch {
    throw new ApiError(400, "请求正文必须是有效的 JSON");
  }
  return parse(schema, value);
}

export const pageSchema = z.object({
  page: z.coerce.number().int().min(1).max(1_000_000).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(FUEL_PAGE_SIZE),
});

export const keywordSchema = z.string().trim().max(100)
  .refine((value) => !value.includes("\u0000"), "关键词包含无效字符").default("");

export function requestQuery(request: Request) {
  return Object.fromEntries(new URL(request.url).searchParams);
}

export function uuid(value: string) {
  return parse(z.uuid("无效的记录编号"), value);
}

export function searchPattern(value: string) {
  return `%${value.replace(/[\\%_]/g, "\\$&")}%`;
}
