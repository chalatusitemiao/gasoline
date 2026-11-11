import { getAuth } from "@/lib/auth";
import { loginErrorMessage, loginSchema } from "@/lib/login-contract";
import { apiFailure, apiResponse, authCookieHeaders, requireSameOrigin } from "@/lib/server-api";

export async function POST(request: Request) {
  try {
    requireSameOrigin(request);
    const login = loginSchema.safeParse(await request.json().catch(() => null));
    if (!login.success) return apiResponse(401, null, loginErrorMessage);

    const result = await getAuth().api.loginFuelAccount({
      headers: request.headers,
      body: login.data,
      asResponse: true,
    });
    if (result.status === 401) return apiResponse(401, null, loginErrorMessage);
    if (!result.ok) return apiResponse(500, null, "登录失败，请稍后重试");
    return apiResponse(200, { name: login.data.username }, "登录成功", authCookieHeaders(result));
  } catch (error) {
    return apiFailure(error);
  }
}
