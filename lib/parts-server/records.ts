import "server-only";

import { and, count, desc, eq, gte, isNotNull, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import { requireCompanyId } from "@/lib/company-context";
import { getCompanyBusinessSettings } from "@/lib/company-settings";
import { fleetProjects, vehicles } from "@/lib/db/fuel-schema";
import { partChanges, partRecords } from "@/lib/db/parts-schema";
import type { FuelPage } from "@/lib/fuel";
import { todayInBusinessZone } from "@/lib/fuel-calendar";
import { FuelDecimal } from "@/lib/fuel-server/calculations";
import { pageSchema, parse, readFuel, writeFuel, type FuelReadDb, type FuelTx } from "@/lib/fuel-server/shared";
import {
  PART_PROJECT_UNASSIGNED, partMonthSchema, partRecordInputSchema, partRecordUpdateSchema,
  type PartDeletion, type PartFieldChange, type PartPhoto, type PartRecord, type PartRecordDetail, type PartRecordsPage,
} from "@/lib/parts";
import { ApiError, type ApiActor } from "@/lib/server-api";
import { listPartPhotos, retainPartPhotos } from "./photos";

export { listPartPhotos } from "./photos";

const recordFields = {
  id: partRecords.id,
  vehicleId: partRecords.vehicleId,
  projectId: partRecords.projectId,
  date: partRecords.date,
  name: partRecords.name,
  quantity: partRecords.quantity,
  unitPrice: partRecords.unitPrice,
  amount: partRecords.amount,
  purchaseArea: partRecords.purchaseArea,
  createdById: partRecords.createdById,
  createdBy: partRecords.createdBy,
  createdAt: partRecords.createdAt,
  updatedBy: partRecords.updatedBy,
  updatedAt: partRecords.updatedAt,
};

const filters = pageSchema.extend({
  vehicleId: z.uuid("请选择有效车辆").optional(),
  month: partMonthSchema.optional(),
  projectId: z.union([z.literal(PART_PROJECT_UNASSIGNED), z.uuid()]).optional(),
});
type RecordInput = z.output<typeof partRecordInputSchema>;
type PartRecordRow = Omit<PartRecord, "createdAt" | "updatedAt" | "photos"> & { createdAt: Date; updatedAt: Date };

function formatRecord(row: PartRecordRow, photos: PartPhoto[]): PartRecord {
  return { ...row, createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString(), photos };
}

function selectRecords(db: FuelReadDb) {
  return db.select({ ...recordFields, plate: vehicles.plate, projectName: fleetProjects.name }).from(partRecords)
    .innerJoin(vehicles, and(eq(vehicles.companyId, partRecords.companyId), eq(vehicles.id, partRecords.vehicleId)))
    .leftJoin(fleetProjects, and(eq(fleetProjects.companyId, partRecords.companyId), eq(fleetProjects.id, partRecords.projectId)));
}

function recordWhere({ month, vehicleId, projectId }: z.output<typeof filters>, companyId: string) {
  const firstDay = month ? `${month}-01` : undefined;
  return and(
    eq(partRecords.companyId, companyId),
    vehicleId ? eq(partRecords.vehicleId, vehicleId) : undefined,
    projectId === PART_PROJECT_UNASSIGNED ? isNull(partRecords.projectId)
      : projectId ? eq(partRecords.projectId, projectId) : undefined,
    firstDay ? gte(partRecords.date, firstDay) : undefined,
    firstDay ? sql`${partRecords.date} < (${firstDay}::date + interval '1 month')` : undefined,
  );
}

async function findActiveRecord(db: FuelReadDb, companyId: string, id: string) {
  const [row] = await selectRecords(db).where(and(
    eq(partRecords.companyId, companyId), eq(partRecords.id, id), isNull(partRecords.deletedAt),
  )).limit(1);
  if (!row) throw new ApiError(404, "配件记录不存在");
  const photos = await listPartPhotos(db, companyId, [row.id]);
  return formatRecord(row, photos.get(row.id) ?? []);
}

export async function listPartRecords(query: unknown): Promise<PartRecordsPage> {
  const companyId = await requireCompanyId();
  const params = parse(filters, query);
  const { page, pageSize } = params;
  const where = and(recordWhere(params, companyId), isNull(partRecords.deletedAt));
  return readFuel(async (db) => {
    const [summary] = await db.select({
      total: count(), totalAmount: sql<string>`coalesce(sum(${partRecords.amount}), 0)::text`,
    }).from(partRecords).where(where);
    const rows = await selectRecords(db).where(where)
      .orderBy(desc(partRecords.date), desc(partRecords.createdAt), desc(partRecords.id))
      .limit(pageSize).offset((page - 1) * pageSize);
    const photos = await listPartPhotos(db, companyId, rows.map(({ id }) => id));
    return { ...summary, page, pageSize, items: rows.map((row) => formatRecord(row, photos.get(row.id) ?? [])) };
  });
}

export async function getPartRecord(id: string, actor: ApiActor): Promise<PartRecordDetail> {
  const companyId = await requireCompanyId();
  return readFuel(async (db) => {
    const [deleted] = actor.permissions.includes("parts:delete") ? await db.select({ record: partRecords.deletionSnapshot })
      .from(partRecords).where(and(
        eq(partRecords.companyId, companyId), eq(partRecords.id, id), isNotNull(partRecords.deletedAt),
      )).limit(1) : [];
    const record = deleted?.record ?? await findActiveRecord(db, companyId, id);
    const changes = await db.select({
      id: partChanges.id, changedBy: partChanges.changedBy, changedAt: partChanges.changedAt,
      reason: partChanges.reason, changes: partChanges.changes,
    }).from(partChanges).where(and(eq(partChanges.companyId, companyId), eq(partChanges.recordId, record.id)))
      .orderBy(desc(partChanges.changedAt), desc(partChanges.id));
    return { record, changes: changes.map((change) => ({ ...change, changedAt: change.changedAt.toISOString() })) };
  });
}

async function partAssignments(
  db: FuelTx, companyId: string, input: Pick<RecordInput, "date" | "vehicleId" | "projectId">, previous?: PartRecord,
) {
  const { timeZone } = await getCompanyBusinessSettings(companyId, db);
  if (input.date > todayInBusinessZone(timeZone)) throw new ApiError(400, "购买日期不能晚于今天");

  const [vehicle] = await db.select({ id: vehicles.id, plate: vehicles.plate, projectId: vehicles.projectId }).from(vehicles)
    .where(and(eq(vehicles.companyId, companyId), eq(vehicles.id, input.vehicleId))).limit(1);
  if (!vehicle) throw new ApiError(400, "所选车辆不存在");

  const defaultProjectId = previous ? previous.projectId : vehicle.projectId;
  const projectId = input.projectId === undefined ? defaultProjectId : input.projectId;
  if (projectId === null) return { vehicle, projectId: null, projectName: null };

  // 停用项目仍可用于录入发生在项目停用前的历史支出。
  const [project] = await db.select({ id: fleetProjects.id, name: fleetProjects.name }).from(fleetProjects)
    .where(and(eq(fleetProjects.companyId, companyId), eq(fleetProjects.id, projectId))).limit(1);
  if (!project) throw new ApiError(400, "所选项目不存在");
  return { vehicle, projectId: project.id, projectName: project.name };
}

function partAmounts(quantity: string, unitPrice: string) {
  const units = new FuelDecimal(quantity);
  const price = new FuelDecimal(unitPrice);
  return { quantity: units.toFixed(3), unitPrice: price.toFixed(2), amount: units.times(price).toFixed(2) };
}

export async function createPartRecord(input: RecordInput, actor: ApiActor): Promise<PartRecord> {
  const companyId = await requireCompanyId();
  return writeFuel(async (db) => {
    const { vehicle, projectId, projectName } = await partAssignments(db, companyId, input);
    const { date, name, purchaseArea } = input;
    const [row] = await db.insert(partRecords).values({
      companyId, vehicleId: vehicle.id, projectId, date, name, purchaseArea,
      ...partAmounts(input.quantity, input.unitPrice),
      createdById: actor.id, createdBy: actor.name, updatedBy: actor.name,
    }).returning(recordFields);
    return formatRecord({ ...row, plate: vehicle.plate, projectName }, []);
  });
}

const auditedFields = [
  ["plate", "车牌"], ["projectName", "项目"], ["date", "购买日期"], ["name", "配件名称"],
  ["quantity", "数量"], ["unitPrice", "单价"], ["amount", "总价"], ["purchaseArea", "购买地区"],
] as const;

function recordChanges(previous: PartRecord, next: PartRecord) {
  const changes: PartFieldChange[] = auditedFields.flatMap(([key, field]) =>
    previous[key] === next[key] ? [] : [{ field, before: previous[key] ?? "", after: next[key] ?? "" }]);
  const afterIds = new Set(next.photos.map(({ id }) => id));
  if (previous.photos.length !== next.photos.length || previous.photos.some(({ id }) => !afterIds.has(id))) {
    changes.push({
      field: "照片", before: `${previous.photos.length} 张`, after: `${next.photos.length} 张`,
      beforePhotos: previous.photos, afterPhotos: next.photos,
    });
  }
  return changes;
}

export async function updatePartRecord(id: string, input: z.output<typeof partRecordUpdateSchema>, actor: ApiActor) {
  const companyId = await requireCompanyId();
  return writeFuel(async (db) => {
    const previous = await findActiveRecord(db, companyId, id);
    if (!actor.permissions.includes("parts:delete") && previous.createdById !== actor.id) {
      throw new ApiError(403, "录入员只能修改自己创建的配件记录");
    }
    const { vehicle, projectId, projectName } = await partAssignments(db, companyId, input, previous);
    const photos = await retainPartPhotos(db, companyId, previous.id, previous.photos, input.photos);
    const { date, name, purchaseArea } = input;
    const now = new Date();
    const values = {
      vehicleId: vehicle.id, projectId, date, name, purchaseArea,
      ...partAmounts(input.quantity, input.unitPrice), updatedBy: actor.name, updatedAt: now,
    };
    const next: PartRecord = {
      ...previous, ...values, plate: vehicle.plate, projectName, photos, updatedAt: now.toISOString(),
    };
    const changes = recordChanges(previous, next);
    if (changes.length === 0) return previous;

    await db.update(partRecords).set(values).where(and(eq(partRecords.companyId, companyId), eq(partRecords.id, previous.id)));
    await db.insert(partChanges).values({
      companyId, recordId: previous.id, changedById: actor.id, changedBy: actor.name, reason: input.reason, changes, changedAt: now,
    });
    return next;
  });
}

export async function deletePartRecord(id: string, reason: string, actor: ApiActor) {
  const companyId = await requireCompanyId();
  return writeFuel(async (db) => {
    const record = await findActiveRecord(db, companyId, id);
    await db.update(partRecords).set({
      deletedById: actor.id, deletedBy: actor.name, deletedAt: new Date(), deletionReason: reason, deletionSnapshot: record,
    }).where(and(eq(partRecords.companyId, companyId), eq(partRecords.id, record.id)));
    return { id: record.id };
  });
}

export async function listPartDeletions(query: unknown): Promise<FuelPage<PartDeletion>> {
  const companyId = await requireCompanyId();
  const params = parse(filters, query);
  const { page, pageSize } = params;
  const where = and(recordWhere(params, companyId), isNotNull(partRecords.deletedAt));
  return readFuel(async (db) => {
    const [{ total }] = await db.select({ total: count() }).from(partRecords).where(where);
    const rows = await db.select({
      snapshot: partRecords.deletionSnapshot, deletedBy: partRecords.deletedBy,
      deletedAt: partRecords.deletedAt, deletionReason: partRecords.deletionReason,
    }).from(partRecords).where(where).orderBy(desc(partRecords.deletedAt), desc(partRecords.id))
      .limit(pageSize).offset((page - 1) * pageSize);
    const items = rows.map(({ snapshot, deletedBy, deletedAt, deletionReason }) => {
      if (!snapshot || deletedBy === null || !deletedAt || deletionReason === null) {
        throw new Error("配件删除记录不完整");
      }
      return { ...snapshot, deletedBy, deletedAt: deletedAt.toISOString(), deletionReason };
    });
    return { items, total, page, pageSize };
  });
}
