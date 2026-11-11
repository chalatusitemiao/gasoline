import { z } from "zod";
import { getAuth } from "@/lib/auth";
import { getDatabaseUrl, getDb } from "@/lib/db";
import { getRegistrationKey, matchesRegistrationKey, upsertFleetUser } from "@/lib/fuel-credentials";
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
    const credentials = await withSystemSettings(async () => {
      if (!getDatabaseUrl()) throw new ApiError(503, "数据库连接尚未配置");
      if (!getRegistrationKey()) throw new ApiError(503, "当前环境未启用账号注册");

      await requireSameOrigin(request);
      const { username, password, registrationKey } = await body(request, registrationSchema);
      if (!matchesRegistrationKey(registrationKey)) throw new ApiError(403, "注册密钥错误");

      const { settings, revision } = await getSystemSettingsSnapshot();
      if (hasFleetAccount(settings)) throw new ApiError(409, "后台账号已注册，请登录");

      const passwordHash = await hashSettingsPassword(password);
      const db = await getDb();
      await db.transaction(async (tx) => {
        await writeStoredSettings({ ...settings, username, passwordHash }, revision, tx);
        await upsertFleetUser(tx, username);
      });
      return { username, password };
    });

    // 重新读取系统配置，让自动登录使用刚提交的账号凭据。
    const login = await withSystemSettings(async () => {
      const auth = await getAuth(request.headers, request.url);
      return auth.api.loginFuelAccount({
        headers: request.headers,
        body: credentials,
        asResponse: true,
      });
    }).catch(() => {
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
