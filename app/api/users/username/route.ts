import { z } from "zod";
import { changeOwnFuelUsername } from "@/lib/fuel-credentials";
import { body } from "@/lib/fuel-server/shared";
import { usernameSchema } from "@/lib/login-contract";
import { apiResponse, apiRoute, clearSessionCookieHeaders } from "@/lib/server-api";

const usernameInput = z.object({
  username: usernameSchema,
  currentPassword: z.string().min(1, "请输入当前密码").max(1024),
}).strict();

export function PUT(request: Request) {
  return apiRoute(request, async (actor) => {
    const { currentPassword, username } = await body(request, usernameInput);
    await changeOwnFuelUsername(actor, currentPassword, username);
    return apiResponse(200, { requireLogin: true }, "登录账号已修改，请重新登录", clearSessionCookieHeaders());
  }, { permission: "platform:view" });
}
