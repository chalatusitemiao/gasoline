import { z } from "zod";
import type { FuelPage } from "./fuel";

export const PART_PHOTO_LIMIT = 3;
export const PART_PHOTO_MAX_BYTES = 1024 * 1024;
export const PART_PROJECT_UNASSIGNED = "unassigned";
export const partPhotoMimeTypes = ["image/jpeg", "image/png", "image/webp"] as const;
const photoMimeTypeSchema = z.enum(partPhotoMimeTypes);
const photoInputError = "照片上传已暂停，仅支持提交有效的已有照片编号";
const partPhotoInputSchema = z.strictObject({
  id: z.uuid(photoInputError).transform((value) => value.toLowerCase()),
}, photoInputError);

function partText(max: number, label: string) {
  return z.string().trim().max(max, `${label}最多 ${max} 字`)
    .refine((value) => !value.includes("\u0000"), `${label}包含无效字符`);
}

export const partQuantitySchema = z.union([z.string(), z.number()]).transform((value) => String(value).trim())
  .refine((value) => /^\d{1,7}(?:\.\d{1,3})?$/.test(value) && /[1-9]/.test(value),
    "数量必须大于 0，最多 7 位整数和 3 位小数");
export const partUnitPriceSchema = z.union([z.string(), z.number()]).transform((value) => String(value).trim())
  .refine((value) => /^\d{1,9}(?:\.\d{1,2})?$/.test(value), "单价必须为非负数，最多 9 位整数和 2 位小数");
export const partMonthSchema = z.string().regex(/^(?!0000)\d{4}-(0[1-9]|1[0-2])$/, "请选择有效月份");

const partRecordFields = z.object({
  vehicleId: z.uuid("请选择车辆"),
  projectId: z.uuid("请选择有效项目").nullable().optional(),
  date: z.iso.date("请输入有效的购买日期")
    .refine((value) => !value.startsWith("0000-"), "请输入有效的购买日期"),
  name: partText(100, "配件名称").min(1, "请输入配件名称"),
  quantity: partQuantitySchema,
  unitPrice: partUnitPriceSchema,
  purchaseArea: partText(100, "购买地区").default(""),
});

export const partRecordInputSchema = partRecordFields.extend({
  photos: z.array(z.never("照片上传已暂停")).optional(),
});

export const partRecordUpdateSchema = partRecordFields.extend({
  photos: z.array(partPhotoInputSchema).max(PART_PHOTO_LIMIT, `最多保留 ${PART_PHOTO_LIMIT} 张照片`).optional(),
  reason: partText(500, "修改原因").min(1, "请填写修改原因"),
});

export const partDeleteInputSchema = z.object({
  reason: partText(500, "删除原因").min(1, "请填写删除原因"),
});

export type PartPhotoMimeType = z.infer<typeof photoMimeTypeSchema>;
export type PartPhoto = { id: string; mimeType: PartPhotoMimeType };
export type PartPhotoData = PartPhoto & { data: string };
export type PartPhotoInput = z.input<typeof partPhotoInputSchema>;
export type PartRecordInput = z.input<typeof partRecordInputSchema>;
export type PartRecordUpdate = z.input<typeof partRecordUpdateSchema>;

export type PartRecord = {
  id: string;
  vehicleId: string;
  plate: string;
  projectId: string | null;
  projectName: string | null;
  date: string;
  name: string;
  quantity: string;
  unitPrice: string;
  amount: string;
  purchaseArea: string;
  createdById: string;
  createdBy: string;
  createdAt: string;
  updatedBy: string;
  updatedAt: string;
  photos: PartPhoto[];
};

export type PartFieldChange = {
  field: string;
  before: string;
  after: string;
  beforePhotos?: PartPhoto[];
  afterPhotos?: PartPhoto[];
};
export type PartChange = {
  id: string;
  changedBy: string;
  changedAt: string;
  reason: string;
  changes: PartFieldChange[];
};
export type PartRecordDetail = { record: PartRecord; changes: PartChange[] };
export type PartRecordsPage = FuelPage<PartRecord> & { totalAmount: string };
export type PartDeletion = PartRecord & { deletedBy: string; deletedAt: string; deletionReason: string };
