import { getAuth } from "@/lib/auth";
import { companyBillingDenials } from "@/lib/company-access";
import { getDatabaseUrl } from "@/lib/db";
import { hasRegisteredFuelAccount } from "@/lib/fuel-credentials";
import { loginErrorMessage, loginSchema } from "@/lib/login-contract";
import { apiFailure, apiResponse, authCookieHeaders, requireSameOrigin } from "@/lib/server-api";
import { getSystemSettings, hasFleetAccount, withSystemSettings } from "@/lib/system-settings";

export async function POST(request: Request) {
  return withSystemSettings(async () => {
    try {
      await requireSameOrigin(request);
      if (!getDatabaseUrl()) return apiResponse(503, null, "数据库连接尚未配置");
      if (!await hasRegisteredFuelAccount() && !hasFleetAccount(await getSystemSettings())) {
        return apiResponse(409, null, "请先注册超级管理员账号");
      }
      const login = loginSchema.safeParse(await request.json().catch(() => null));
      if (!login.success) return apiResponse(401, null, loginErrorMessage);

      const auth = await getAuth(request.headers, request.url);
      const result = await auth.api.loginFuelAccount({
        headers: request.headers,
        body: login.data,
        asResponse: true,
      });
      if (result.status === 401) return apiResponse(401, null, loginErrorMessage);
      if (result.status === 403) {
        const error = await result.json().catch(() => null);
        const denial = Object.values(companyBillingDenials).find(({ code }) => code === error?.code);
        if (denial) return apiResponse(403, null, denial.message);
      }
      if (!result.ok) return apiResponse(500, null, "登录失败，请稍后重试");
      return apiResponse(200, { name: login.data.username }, "登录成功", authCookieHeaders(result));
    } catch (error) {
      return apiFailure(error);
    }
  });
}
