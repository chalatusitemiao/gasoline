import { invoke } from "@tauri-apps/api/core";
import type { ApiResponse } from "@/lib/api";
import { apiRequest, ApiClientError, configureApiTransport } from "@/lib/api-client";

export const serverStorageKey = "gasoline.desktop.server";
export const sessionExpiredEvent = "gasoline:session-expired";

type NativeResponse = { status: number; body: string; contentType: string | null };
type AccountSettings = { username: string; timeZone: string };
export type DesktopSession = {
  name: string | null;
  timeZone: string | null;
  registrationUnavailable: string | null;
};

let activeOrigin: string | null = null;

function waitForResponse<T>(operation: Promise<T>, signal: AbortSignal) {
  return new Promise<T>((resolve, reject) => {
    const abort = () => reject(signal.reason);
    if (signal.aborted) abort();
    else signal.addEventListener("abort", abort, { once: true });
    void operation.then(resolve, reject).finally(() => signal.removeEventListener("abort", abort));
  });
}

async function nativeRequest(input: string | URL | Request, init?: RequestInit) {
  const origin = activeOrigin;
  if (!origin) throw new ApiClientError("请先连接车辆监控服务器", 0);
  const url = new URL(input instanceof Request ? input.url : input, origin);
  if ((url.origin !== origin && url.origin !== window.location.origin) || !url.pathname.startsWith("/api/")) {
    throw new ApiClientError("只能访问当前服务器的车辆监控接口", 0);
  }

  const request = new Request(input instanceof Request ? input : url, init);
  const body = request.body ? await request.text() : undefined;
  request.signal.throwIfAborted();

  try {
    const result = await waitForResponse(invoke<NativeResponse>("api_request", {
      request: {
        path: url.pathname + url.search,
        method: request.method,
        body,
        contentType: request.headers.get("content-type"),
      },
    }), request.signal);
    if (result.status >= 300 && result.status < 400 && result.status !== 304) {
      throw new ApiClientError("服务器地址发生重定向，请填写最终的网页版地址", result.status);
    }
    const noBody = request.method === "HEAD" || [204, 205, 304].includes(result.status);
    return new Response(noBody ? null : result.body, {
      status: result.status,
      headers: result.contentType ? { "Content-Type": result.contentType } : undefined,
    });
  } catch (error) {
    request.signal.throwIfAborted();
    if (error instanceof ApiClientError) throw error;
    throw new ApiClientError(typeof error === "string" ? error : "无法连接车辆监控服务器", 0);
  }
}

configureApiTransport({
  request: nativeRequest,
  onUnauthorized: () => window.dispatchEvent(new Event(sessionExpiredEvent)),
});

async function readSession(signal: AbortSignal): Promise<DesktopSession> {
  // The settings endpoint already checks the session and returns the account and business timezone.
  const response = await apiRequest("/api/settings", { signal, cache: "no-store" });
  const result = await response.json().catch(() => null) as ApiResponse<AccountSettings> | null;
  if (response.status === 401 && result?.code === 401 && result.data === null) {
    return { name: null, timeZone: null, registrationUnavailable: null };
  }
  const settings = result?.data;
  if (!response.ok || result?.code !== 0 || !settings || typeof settings.username !== "string" ||
      typeof settings.timeZone !== "string") {
    const message = !response.ok && typeof result?.message === "string" ? result.message : "该地址未返回车辆监控接口数据";
    throw new ApiClientError(message, response.status);
  }
  return { name: settings.username, timeZone: settings.timeZone, registrationUnavailable: "系统已有后台账号，请直接登录。" };
}

export async function loadSession(server: string, signal: AbortSignal) {
  const origin = await invoke<string | null>("set_api_origin", { origin: server });
  signal.throwIfAborted();
  if (!origin) throw new ApiClientError("请先连接车辆监控服务器", 0);
  activeOrigin = origin;
  const session = await readSession(signal);
  localStorage.setItem(serverStorageKey, origin);
  return session;
}

export async function disconnectServer() {
  await invoke("set_api_origin", { origin: null });
  activeOrigin = null;
  localStorage.removeItem(serverStorageKey);
}
