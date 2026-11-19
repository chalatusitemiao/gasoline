import "server-only";

import { and, asc, count, eq, ilike, inArray, or } from "drizzle-orm";
import { z } from "zod";
import { requireCompanyId } from "@/lib/company-context";
import { getDb } from "@/lib/db";
import { fleetProjects } from "@/lib/db/fuel-schema";
import { projectInputSchema, projectNameKey, type FleetProject, type ProjectImportResult } from "@/lib/fleet-project";
import { FUEL_IMPORT_LIMIT, type FuelPage } from "@/lib/fuel";
import { ApiError } from "@/lib/server-api";
import { keywordSchema, pageSchema, parse, readFuel, searchPattern, writeFuel, type FuelTx } from "./shared";

const projectOptionFields = {
  id: fleetProjects.id,
  name: fleetProjects.name,
  isActive: fleetProjects.isActive,
};
const projectFields = {
  ...projectOptionFields,
  manager: fleetProjects.manager,
  phone: fleetProjects.phone,
  createdAt: fleetProjects.createdAt,
  updatedAt: fleetProjects.updatedAt,
};

const filterSchema = pageSchema.extend({
  keyword: keywordSchema,
  isActive: z.enum(["true", "false"]).optional(),
});

function formatProject(row: Omit<FleetProject, "createdAt" | "updatedAt"> & {
  createdAt: Date;
  updatedAt: Date;
}): FleetProject {
  return { ...row, createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString() };
}

export async function listProjects(query: unknown): Promise<FuelPage<FleetProject>> {
  const companyId = await requireCompanyId();
  const { keyword, isActive, page, pageSize } = parse(filterSchema, query);
  const where = and(
    eq(fleetProjects.companyId, companyId),
    keyword ? or(
      ilike(fleetProjects.nameKey, searchPattern(projectNameKey(keyword))),
      ilike(fleetProjects.manager, searchPattern(keyword)),
      ilike(fleetProjects.phone, searchPattern(keyword)),
    ) : undefined,
    isActive === undefined ? undefined : eq(fleetProjects.isActive, isActive === "true"),
  );

  return readFuel(async (db) => {
    const [summary] = await db.select({ total: count() }).from(fleetProjects).where(where);
    const rows = await db.select(projectFields).from(fleetProjects).where(where)
      .orderBy(asc(fleetProjects.nameKey), asc(fleetProjects.id)).limit(pageSize).offset((page - 1) * pageSize);
    return { items: rows.map(formatProject), total: summary.total, page, pageSize };
  });
}

export async function getProjectOptions() {
  const companyId = await requireCompanyId();
  const db = await getDb();
  return db.select(projectOptionFields).from(fleetProjects).where(eq(fleetProjects.companyId, companyId))
    .orderBy(asc(fleetProjects.nameKey), asc(fleetProjects.id));
}

export async function getProject(id: string) {
  const companyId = await requireCompanyId();
  const db = await getDb();
  const [row] = await db.select(projectFields).from(fleetProjects)
    .where(and(eq(fleetProjects.companyId, companyId), eq(fleetProjects.id, id))).limit(1);
  if (!row) throw new ApiError(404, "项目不存在");
  return formatProject(row);
}

export async function saveProject(input: z.output<typeof projectInputSchema>, id?: string) {
  const companyId = await requireCompanyId();
  return writeFuel(async (db) => {
    const nameKey = projectNameKey(input.name);
    const [existing] = await db.select({ id: fleetProjects.id }).from(fleetProjects)
      .where(and(eq(fleetProjects.companyId, companyId), eq(fleetProjects.nameKey, nameKey))).limit(1);
    if (existing && existing.id !== id) throw new ApiError(409, "该项目名称已存在");

    const values = { ...input, companyId, nameKey };
    const [saved] = id
      ? await db.update(fleetProjects).set({ ...values, updatedAt: new Date() })
        .where(and(eq(fleetProjects.companyId, companyId), eq(fleetProjects.id, id))).returning(projectFields)
      : await db.insert(fleetProjects).values(values).returning(projectFields);
    if (!saved) throw new ApiError(404, "项目不存在");
    return formatProject(saved);
  });
}

export const projectImportSchema = z.object({
  rows: z.array(z.object({
    rowNumber: z.number().int().min(1),
    name: z.string(),
    manager: z.string().optional(),
    phone: z.string().optional(),
  })).min(1).max(FUEL_IMPORT_LIMIT),
});

export async function importProjects({ rows }: z.output<typeof projectImportSchema>): Promise<ProjectImportResult> {
  const companyId = await requireCompanyId();
  return writeFuel(async (db) => {
    const parsed = rows.map((row) => ({ row, result: projectInputSchema.safeParse(row) }));
    const keys = [...new Set(parsed.flatMap(({ result }) => result.success ? [projectNameKey(result.data.name)] : []))];
    const current = keys.length > 0
      ? await db.select({ nameKey: fleetProjects.nameKey }).from(fleetProjects)
        .where(and(eq(fleetProjects.companyId, companyId), inArray(fleetProjects.nameKey, keys)))
      : [];
    const known = new Set(current.map(({ nameKey }) => nameKey));
    const issues: ProjectImportResult["issues"] = [];
    const inserts: (typeof fleetProjects.$inferInsert)[] = [];

    for (const { row, result } of parsed) {
      if (!result.success) {
        issues.push({ rowNumber: row.rowNumber, name: row.name, reason: result.error.issues[0].message });
        continue;
      }
      const nameKey = projectNameKey(result.data.name);
      if (known.has(nameKey)) {
        issues.push({ rowNumber: row.rowNumber, name: row.name, reason: "项目名称重复" });
        continue;
      }
      known.add(nameKey);
      inserts.push({ ...result.data, companyId, nameKey });
    }

    if (inserts.length > 0) await db.insert(fleetProjects).values(inserts);
    return { added: inserts.length, issues };
  });
}

export async function requireAssignableProject(
  db: FuelTx,
  companyId: string,
  projectId: string | null | undefined,
  currentProjectId?: string | null,
) {
  if (!projectId || projectId === currentProjectId) return;
  const [project] = await db.select({ isActive: fleetProjects.isActive }).from(fleetProjects)
    .where(and(eq(fleetProjects.companyId, companyId), eq(fleetProjects.id, projectId))).limit(1);
  if (!project) throw new ApiError(404, "项目不存在");
  if (!project.isActive) throw new ApiError(409, "该项目已停用，请选择在用项目");
}
