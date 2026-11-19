import { z } from "zod";
import { createFuelUser, listFuelUsers } from "@/lib/fuel-credentials";
import { body, parse, requestQuery } from "@/lib/fuel-server/shared";
import { apiRoute } from "@/lib/server-api";
import { companyUserRoles } from "@/lib/permissions";
import { usernameSchema } from "@/lib/login-contract";

const createUserSchema = z.object({
  username: usernameSchema,
  password: z.string().min(8, "密码至少需要 8 位").max(1024),
  role: z.enum(companyUserRoles),
  companyId: z.uuid("无效的公司编号").optional(),
}).strict();

const usersQuery = z.object({ companyId: z.uuid("无效的公司编号").optional() });

export function GET(request: Request) {
  return apiRoute(request, (actor) => {
    const { companyId } = parse(usersQuery, requestQuery(request));
    return listFuelUsers(actor, companyId);
  }, { permission: "users:manage" });
}

export function POST(request: Request) {
  return apiRoute(request, async (actor) => {
    const input = await body(request, createUserSchema);
    const account = await createFuelUser(input, actor);
    return account;
  }, { permission: "users:manage", status: 201 });
}
