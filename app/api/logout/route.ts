import { getAuth } from "@/lib/auth";
import { ApiError, apiResponse, apiRoute, authCookieHeaders } from "@/lib/server-api";

export async function POST(request: Request) {
  return apiRoute(request, async () => {
    const auth = await getAuth(request.headers, request.url);
    const result = await auth.api.signOut({ headers: request.headers, asResponse: true });
    if (!result.ok) throw new ApiError(500, "退出失败，请重试");
    return apiResponse(200, null, "已退出", authCookieHeaders(result));
  });
}
