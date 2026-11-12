"use client";

import type { ApiResponse } from "./api";
import { loginPath } from "./login-path";

export class ApiClientError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

export function jsonRequest(method: string, body: unknown): RequestInit {
  return { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) };
}

type ApiInput = string | URL | Request;
type ApiTransport = {
  request: (input: ApiInput, init?: RequestInit) => Promise<Response>;
  onUnauthorized: () => void;
};

let apiTransport: ApiTransport | undefined;

export function configureApiTransport(transport: ApiTransport) {
  apiTransport = transport;
}

export function apiRequest(input: ApiInput, init?: RequestInit) {
  if (apiTransport) return apiTransport.request(input, init);
  return fetch(input, { ...init, credentials: "same-origin" });
}

export function redirectForUnauthorized(status: number, input?: ApiInput) {
  if (status !== 401) return;
  if (apiTransport) {
    const path = input instanceof Request ? input.url : input;
    const pathname = path ? new URL(path, window.location.href).pathname : undefined;
    if (pathname !== "/api/login" && pathname !== "/api/register") apiTransport.onUnauthorized();
    return;
  }
  if (window.location.pathname !== "/login") {
    window.location.replace(loginPath(window.location.pathname + window.location.search + window.location.hash));
  }
}

export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await apiRequest(path, { ...init, cache: "no-store" });
  redirectForUnauthorized(response.status, path);
  const result = await response.json().catch(() => null) as ApiResponse<T> | null;
  if (!response.ok || result?.code !== 0) {
    throw new ApiClientError(result?.message || "操作失败，请稍后重试", response.status);
  }
  return result.data as T;
}
