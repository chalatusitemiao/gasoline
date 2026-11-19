import { z } from "zod";
import { setFuelUserAccess } from "@/lib/fuel-credentials";
import { body } from "@/lib/fuel-server/shared";
import { ApiError, apiRoute } from "@/lib/server-api";
import { companyUserRoles } from "@/lib/permissions";

type Context = { params: Promise<{ id: string }> };

const updateUserSchema = z.object({
  role: z.enum(companyUserRoles),
  isActive: z.boolean(),
  password: z.string().min(8, "密码至少需要 8 位").max(1024).optional(),
}).strict();

export function PUT(request: Request, { params }: Context) {
  return apiRoute(request, async (actor) => {
    const { role, isActive, password } = await body(request, updateUserSchema);
    const result = await setFuelUserAccess((await params).id, { role, isActive, password }, actor);
    if (!result) throw new ApiError(404, "账号不存在");
    return result;
  }, { permission: "users:manage" });
}
