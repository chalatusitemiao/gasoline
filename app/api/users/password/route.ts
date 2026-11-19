import { z } from "zod";
import { changeOwnFuelPassword } from "@/lib/fuel-credentials";
import { body } from "@/lib/fuel-server/shared";
import { apiResponse, apiRoute, clearSessionCookieHeaders } from "@/lib/server-api";

const passwordInput = z.object({
  currentPassword: z.string().min(1, "请输入当前密码").max(1024),
  password: z.string().min(8, "新密码至少需要 8 位").max(1024),
}).strict();

export function PUT(request: Request) {
  return apiRoute(request, async (actor) => {
    const { currentPassword, password } = await body(request, passwordInput);
    await changeOwnFuelPassword(actor, currentPassword, password);
    return apiResponse(200, { requireLogin: true }, "密码已修改，请重新登录", clearSessionCookieHeaders());
  }, { permission: null });
}
