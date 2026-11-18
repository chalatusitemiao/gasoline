import "server-only";

import { ApiError } from "./api-error";
import { getAuthOrigin, getRequestSession } from "./auth";
import { hasPermission, type Permission, type UserRole } from "./permissions";
import { withSystemSettings } from "./system-settings";

export type ApiActor = { id: string; name: string; role: UserRole; permissions: readonly Permission[] };
export { ApiError } from "./api-error";

export function apiResponse(status: number, data: unknown, message: string, extra?: Headers) {
  const headers = new Headers(extra);
  headers.set("Cache-Control", "private, no-store");
  return Response.json({ code: status < 400 ? 0 : status, data, message }, { status, headers });
}

export function authCookieHeaders(result: Response) {
  const headers = new Headers();
  for (const cookie of result.headers.getSetCookie()) headers.append("Set-Cookie", cookie);
  return headers;
}

export function clearSessionCookieHeaders() {
  const headers = new Headers();
  const base = "=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax";
  headers.append("Set-Cookie", "better-auth.session_token" + base);
  headers.append("Set-Cookie", "__Secure-better-auth.session_token" + base + "; Secure");
  return headers;
}

export function unauthorizedResponse() {
  return apiResponse(401, null, "请先登录", clearSessionCookieHeaders());
}

function checkOrigin(request: Request, expected: string | null) {
  if (!expected || request.headers.get("origin") !== expected) {
    throw new ApiError(403, "请求来源不受信任");
  }
}

export async function requireSameOrigin(request: Request) {
  checkOrigin(request, await getAuthOrigin(request.headers, request.url));
}

export function apiFailure(error: unknown) {
  if (error instanceof ApiError) return apiResponse(error.status, null, error.message);
  console.error("车辆监控接口处理失败", error instanceof Error ? error.name : "UnknownError");
  return apiResponse(500, null, "操作失败，请稍后重试");
}

export async function apiRoute<T>(
  request: Request,
  handle: (actor: ApiActor) => Promise<T>,
  options: { status?: number; permission?: Permission | null } = {},
) {
  return withSystemSettings(async () => {
    try {
      const session = await getRequestSession(request.headers, request.url);
      if (!session) return unauthorizedResponse();
      if (!["GET", "HEAD", "OPTIONS"].includes(request.method)) await requireSameOrigin(request);
      const permission = options.permission === undefined
        ? ["GET", "HEAD", "OPTIONS"].includes(request.method) ? "records:view" : "records:create"
        : options.permission;
      if (permission && !hasPermission(session.user.permissions, permission)) {
        return apiResponse(403, null, "当前账号没有执行此操作的权限");
      }
      const result = await handle({
        id: session.user.id,
        name: session.user.name,
        role: session.user.role,
        permissions: session.user.permissions,
      });
      return result instanceof Response ? result : apiResponse(options.status ?? 200, result, "操作成功");
    } catch (error) {
      return apiFailure(error);
    }
  });
}
