import { z } from "zod";
import { createFuelUser, listFuelUsers } from "@/lib/fuel-credentials";
import { body } from "@/lib/fuel-server/shared";
import { apiRoute } from "@/lib/server-api";
import { userRoles } from "@/lib/permissions";
import { usernameSchema } from "@/lib/login-contract";

const createUserSchema = z.object({
  username: usernameSchema,
  password: z.string().min(8, "密码至少需要 8 位").max(1024),
  role: z.enum(userRoles),
});

export function GET(request: Request) {
  return apiRoute(request, listFuelUsers, { permission: "users:manage" });
}

export function POST(request: Request) {
  return apiRoute(request, async () => {
    const input = await body(request, createUserSchema);
    const account = await createFuelUser(input);
    return account;
  }, { permission: "users:manage", status: 201 });
}
