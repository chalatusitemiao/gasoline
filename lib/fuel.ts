import { z } from "zod";

export const FUEL_PAGE_SIZE = 20;
export const FUEL_IMPORT_LIMIT = 1000;
export const fuelTypes = ["diesel", "gasoline"] as const;
export const fuelTypeSchema = z.enum(fuelTypes);
export type FuelType = z.infer<typeof fuelTypeSchema>;
export type FuelAnomaly = "odometer_not_increased" | "consumption_high";
export type FuelAnomalyAssessment = {
  consumption: string;
  baseline: string;
  multiplier: string;
  threshold: string;
  sampleCount: number;
};

export function plateKey(plate: string) {
  return plate.normalize("NFKC").toUpperCase().replace(/[\s·]/gu, "");
}

export function driverLabel(name: string, id: string) {
  return `${name} · ${id.slice(0, 8)}`;
}

const plateSchema = z.string().trim().max(40).refine(
  (plate) => /^[\p{L}\p{N}]{2,20}$/u.test(plateKey(plate)),
  "请输入有效车牌",
);
const notesSchema = z.string().trim().max(500, "备注最多 500 字")
  .refine((value) => !value.includes("\u0000"), "备注包含无效字符").default("");

function positiveDecimal(digits: number, scale: number, message: string) {
  const format = new RegExp(`^\\d{1,${digits}}(?:\\.\\d{1,${scale}})?$`);
  return z.union([z.string(), z.number()]).transform((value) => String(value).trim())
    .refine((value) => format.test(value) && /[1-9]/.test(value), message);
}

export const fuelLitersSchema = positiveDecimal(7, 3, "油量必须大于 0，最多 3 位小数");
export const fuelUnitPriceSchema = positiveDecimal(6, 6, "单价必须大于 0，最多 6 位小数");
export const fuelAmountSchema = positiveDecimal(16, 2, "金额必须大于 0，最多 2 位小数");
export const fuelOdometerSchema = positiveDecimal(10, 2, "里程必须大于 0，最多 2 位小数");
export const fuelDateSchema = z.iso.date("请输入有效的加油日期")
  .refine((value) => !value.startsWith("0000-"), "请输入有效的加油日期");

export const fuelRecordInputSchema = z.object({
  date: fuelDateSchema,
  vehicleId: z.uuid("请选择车辆"),
  driverId: z.uuid("请选择司机"),
  fuelType: fuelTypeSchema,
  liters: fuelLitersSchema,
  unitPrice: fuelUnitPriceSchema,
  odometer: fuelOdometerSchema,
  notes: notesSchema,
});

export const fuelRecordUpdateSchema = fuelRecordInputSchema.extend({
  reason: z.string().trim().min(1, "请填写修改原因").max(500, "修改原因最多 500 字")
    .refine((value) => !value.includes("\u0000"), "修改原因包含无效字符"),
});

export const vehicleInputSchema = z.object({
  plate: plateSchema,
  fuelType: fuelTypeSchema,
  notes: notesSchema,
});

export const driverInputSchema = z.object({
  name: z.string().trim().min(1, "请输入司机姓名").max(80, "姓名最多 80 字")
    .refine((value) => !value.includes("\u0000"), "姓名包含无效字符"),
  phone: z.string().trim().max(32, "手机号码最多 32 字").regex(/^[+\d\s()-]*$/, "请输入有效手机号码").default(""),
  isActive: z.boolean(),
  notes: notesSchema,
});

export type FuelRecordInput = z.input<typeof fuelRecordInputSchema>;
export type FuelRecordUpdate = z.input<typeof fuelRecordUpdateSchema>;

export type Vehicle = {
  id: string;
  plate: string;
  fuelType: FuelType;
  notes: string;
  createdAt: string;
  updatedAt: string;
  refuelCount?: number;
  lastDate?: string | null;
  lastOdometer?: string | null;
};

export type Driver = {
  id: string;
  name: string;
  phone: string;
  isActive: boolean;
  notes: string;
  createdAt: string;
  updatedAt: string;
  refuelCount?: number;
};

export type FuelOptions = { vehicles: Vehicle[]; drivers: Driver[] };

export type FuelRecord = {
  id: string;
  vehicleId: string;
  plate: string;
  driverId: string;
  driverName: string;
  date: string;
  fuelType: FuelType;
  liters: string;
  unitPrice: string;
  amount: string;
  odometer: string;
  distance: string | null;
  consumption: string | null;
  baseline: string | null;
  anomalyAssessment: FuelAnomalyAssessment | null;
  isAnomaly: boolean;
  anomalyReason: FuelAnomaly | null;
  notes: string;
  source: "manual" | "import";
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  updatedBy: string;
};

export type FuelRecordExportRow = Pick<FuelRecord,
  "date" | "plate" | "driverId" | "driverName" | "fuelType" | "liters" | "unitPrice" | "amount" |
  "odometer" | "distance" | "consumption" | "baseline" | "anomalyAssessment" | "anomalyReason" | "createdBy" | "notes"
>;

export type FuelFieldChange = {
  field: string;
  before: string;
  after: string;
  beforeId?: string;
  afterId?: string;
};

export type FuelChange = {
  id: string;
  changedBy: string;
  changedAt: string;
  reason: string;
  changes: FuelFieldChange[];
};

export type FuelRecordDetail = { record: FuelRecord; changes: FuelChange[] };

export type FuelDeletionSnapshot = FuelRecord & { sequence: number; createdById: string; updatedById: string };

export type FuelDeletion = {
  id: string;
  recordId: string;
  plate: string;
  deletedBy: string;
  reason: string;
  deletedAt: string;
  snapshot: FuelDeletionSnapshot;
};

export type FuelPage<T> = { items: T[]; total: number; page: number; pageSize: number };

export type FuelRecordsPage = FuelPage<FuelRecord> & {
  summary: {
    recordCount: number;
    totalLiters: string;
    totalAmount: string;
    totalDistance: string;
    averageConsumption: string | null;
    exactAverageConsumption: string | null;
    anomalyCount: number;
  };
};
