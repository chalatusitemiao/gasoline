import "server-only";

import { Buffer } from "node:buffer";
import { and, asc, eq, inArray, isNull } from "drizzle-orm";
import { requireCompanyId } from "@/lib/company-context";
import { getDb } from "@/lib/db";
import { partPhotos, partRecords } from "@/lib/db/parts-schema";
import type { FuelReadDb, FuelTx } from "@/lib/fuel-server/shared";
import { PART_PHOTO_MAX_BYTES, type PartPhoto, type PartPhotoData, type PartPhotoInput } from "@/lib/parts";
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

function validatePhoto({ mimeType, data }: Omit<PartPhotoData, "id">) {
  const bytes = Buffer.from(data, "base64");
  if (bytes.length > PART_PHOTO_MAX_BYTES) throw new ApiError(400, "单张照片不能超过 1 MiB");
  if (bytes.toString("base64") !== data) throw new ApiError(400, "照片编码无效");
  const header = bytes.subarray(0, 12);
  const matches = {
    "image/jpeg": header.subarray(0, 3).toString("hex") === "ffd8ff",
    "image/png": header.subarray(0, 8).toString("hex") === "89504e470d0a1a0a",
    "image/webp": header.subarray(0, 4).toString("ascii") === "RIFF" && header.subarray(8).toString("ascii") === "WEBP",
  };
  if (!matches[mimeType]) throw new ApiError(400, "照片内容与格式不符，请选择 JPG、PNG 或 WebP 照片");
}

export async function syncPartPhotos(
  db: FuelTx, companyId: string, recordId: string, previous: PartPhoto[], input?: PartPhotoInput[],
) {
  if (input === undefined) return previous;

  const current = new Map(previous.map((photo) => [photo.id, photo]));
  const retained = new Map<string, PartPhoto>();
  const uploads: (typeof partPhotos.$inferInsert)[] = [];
  for (const photo of input) {
    if ("id" in photo) {
      const match = current.get(photo.id);
      if (!match || retained.has(photo.id)) throw new ApiError(400, "所选照片不存在或已重复选择");
      retained.set(photo.id, match);
    } else {
      validatePhoto(photo);
      uploads.push({ companyId, recordId, ...photo });
    }
  }

  const removed = previous.filter(({ id }) => !retained.has(id)).map(({ id }) => id);
  if (removed.length > 0) {
    await db.update(partPhotos).set({ removedAt: new Date() }).where(and(
      eq(partPhotos.companyId, companyId), eq(partPhotos.recordId, recordId), inArray(partPhotos.id, removed),
    ));
  }
  const added = uploads.length > 0 ? await db.insert(partPhotos).values(uploads).returning(photoFields) : [];
  return [...retained.values(), ...added];
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
