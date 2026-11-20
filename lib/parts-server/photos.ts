import "server-only";

import { and, asc, eq, inArray, isNull } from "drizzle-orm";
import { requireCompanyId } from "@/lib/company-context";
import { getDb } from "@/lib/db";
import { partPhotos, partRecords } from "@/lib/db/parts-schema";
import type { FuelReadDb, FuelTx } from "@/lib/fuel-server/shared";
import type { PartPhoto, PartPhotoData, PartPhotoInput } from "@/lib/parts";
import { ApiError, type ApiActor } from "@/lib/server-api";

const photoFields = { id: partPhotos.id, mimeType: partPhotos.mimeType };

export async function listPartPhotos(db: FuelReadDb, companyId: string, recordIds: string[]) {
  const result = new Map<string, PartPhoto[]>();
  if (recordIds.length === 0) return result;

  const rows = await db.select({ ...photoFields, recordId: partPhotos.recordId }).from(partPhotos)
    .where(and(eq(partPhotos.companyId, companyId), inArray(partPhotos.recordId, recordIds), isNull(partPhotos.removedAt)))
    .orderBy(asc(partPhotos.createdAt), asc(partPhotos.id));
  for (const { recordId, ...photo } of rows) {
    const photos = result.get(recordId) ?? [];
    photos.push(photo);
    result.set(recordId, photos);
  }
  return result;
}

export async function retainPartPhotos(
  db: FuelTx, companyId: string, recordId: string, previous: PartPhoto[], input?: PartPhotoInput[],
) {
  if (input === undefined) return previous;

  const current = new Map(previous.map((photo) => [photo.id, photo]));
  const retained = new Map<string, PartPhoto>();
  for (const { id } of input) {
    const photo = current.get(id);
    if (!photo || retained.has(id)) throw new ApiError(400, "所选照片不存在或已重复选择");
    retained.set(id, photo);
  }

  const removed = previous.filter(({ id }) => !retained.has(id)).map(({ id }) => id);
  if (removed.length > 0) {
    await db.update(partPhotos).set({ removedAt: new Date() }).where(and(
      eq(partPhotos.companyId, companyId), eq(partPhotos.recordId, recordId), inArray(partPhotos.id, removed),
    ));
  }
  return [...retained.values()];
}

export async function getPartPhoto(id: string, actor: ApiActor): Promise<PartPhotoData> {
  const companyId = await requireCompanyId();
  const db = await getDb();
  const [row] = await db.select({ ...photoFields, data: partPhotos.data }).from(partPhotos)
    .innerJoin(partRecords, and(eq(partPhotos.companyId, partRecords.companyId), eq(partPhotos.recordId, partRecords.id)))
    .where(and(
      eq(partPhotos.companyId, companyId), eq(partPhotos.id, id),
      actor.permissions.includes("parts:delete") ? undefined : isNull(partRecords.deletedAt),
    )).limit(1);
  if (!row) throw new ApiError(404, "配件照片不存在");
  return row;
}
