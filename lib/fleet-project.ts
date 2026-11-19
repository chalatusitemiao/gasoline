import { z } from "zod";

function projectText(limit: number, label: string) {
  return z.string().trim().max(limit, `${label}最多 ${limit} 字`)
    .refine((value) => !value.includes("\u0000"), `${label}包含无效字符`);
}

export const projectInputSchema = z.object({
  name: z.string().trim().min(1, "请输入项目名称").max(120, "项目名称最多 120 字")
    .refine((value) => !value.includes("\u0000"), "项目名称包含无效字符"),
  manager: projectText(80, "负责人").default(""),
  phone: projectText(40, "电话").default(""),
  isActive: z.boolean().optional(),
});

export function projectNameKey(name: string) {
  return name.normalize("NFKC").trim().toLowerCase().replace(/\s+/g, " ");
}

export type FleetProject = {
  id: string;
  name: string;
  manager: string;
  phone: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

export type FleetProjectOption = Pick<FleetProject, "id" | "name" | "isActive">;
export type ProjectImportRow = {
  rowNumber: number;
  name: string;
  manager?: string;
  phone?: string;
};
export type ProjectImportResult = {
  added: number;
  issues: { rowNumber: number; name: string; reason: string }[];
};
