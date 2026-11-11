import "server-only";

import { getAuthOrigin, getRequestSession } from "./auth";

export type ApiActor = { id: string; name: string };

export class ApiError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
  }
}

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

export function unauthorizedResponse() {
  const headers = new Headers();
  const base = "=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax";
  headers.append("Set-Cookie", "better-auth.session_token" + base);
  headers.append("Set-Cookie", "__Secure-better-auth.session_token" + base + "; Secure");
  return apiResponse(401, null, "请先登录", headers);
}

export function requireSameOrigin(request: Request) {
  if (request.headers.get("origin") !== getAuthOrigin()) {
    throw new ApiError(403, "请求来源不受信任");
  }
}

export function apiFailure(error: unknown) {
  if (error instanceof ApiError) return apiResponse(error.status, null, error.message);
  console.error("油量监控接口处理失败", error instanceof Error ? error.name : "UnknownError");
  return apiResponse(500, null, "操作失败，请稍后重试");
}

export async function apiRoute<T>(
  request: Request,
  handle: (actor: ApiActor) => Promise<T>,
  options: { status?: number } = {},
) {
  try {
    const session = await getRequestSession(request.headers);
    if (!session) return unauthorizedResponse();
    if (!["GET", "HEAD", "OPTIONS"].includes(request.method)) requireSameOrigin(request);
    const result = await handle({ id: session.user.id, name: session.user.name });
    return result instanceof Response ? result : apiResponse(options.status ?? 200, result, "操作成功");
  } catch (error) {
    return apiFailure(error);
  }
}
