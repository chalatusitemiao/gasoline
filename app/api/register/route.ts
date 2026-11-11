import { z } from "zod";
import { getAuth } from "@/lib/auth";
import { getDatabaseUrl } from "@/lib/db";
import { getRegistrationKey, matchesRegistrationKey } from "@/lib/fuel-credentials";
import { body } from "@/lib/fuel-server/shared";
import { loginSchema } from "@/lib/login-contract";
import { apiFailure, ApiError, apiResponse, authCookieHeaders, requireSameOrigin } from "@/lib/server-api";
import { getSystemSettingsSnapshot, hasFleetAccount, hashSettingsPassword, withSystemSettings } from "@/lib/system-settings";
import { SettingsConflictError, writeStoredSettings } from "@/lib/system-settings-store";

const registrationSchema = loginSchema.extend({
  registrationKey: z.string().trim().min(1, "请输入注册密钥").max(1024),
});

export async function POST(request: Request) {
  try {
    const { auth, credentials } = await withSystemSettings(async () => {
      if (!getDatabaseUrl()) throw new ApiError(503, "数据库连接尚未配置");
      if (!getRegistrationKey()) throw new ApiError(503, "当前环境未启用账号注册");

      await requireSameOrigin(request);
      const { username, password, registrationKey } = await body(request, registrationSchema);
      if (!matchesRegistrationKey(registrationKey)) throw new ApiError(403, "注册密钥错误");

      const { settings, revision } = await getSystemSettingsSnapshot();
      if (hasFleetAccount(settings)) throw new ApiError(409, "后台账号已注册，请登录");

      const auth = await getAuth(request.headers, request.url);
      const passwordHash = await hashSettingsPassword(password);
      await writeStoredSettings({ ...settings, username, passwordHash }, revision);
      return { auth, credentials: { username, password } };
    });

    // Read the saved credentials in a fresh request scope.
    const login = await withSystemSettings(() => auth.api.loginFuelAccount({
      headers: request.headers,
      body: credentials,
      asResponse: true,
    })).catch(() => {
      console.error("注册后的自动登录失败");
      return null;
    });
    const account = { name: credentials.username };
    return login?.ok
      ? apiResponse(201, account, "注册成功", authCookieHeaders(login))
      : apiResponse(201, account, "账号已注册，请登录");
  } catch (error) {
    if (error instanceof SettingsConflictError) {
      return apiResponse(409, null, "后台账号已注册，请登录");
    }
    return apiFailure(error);
  }
}
