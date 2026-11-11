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

export function redirectForUnauthorized(status: number) {
  if (status === 401 && window.location.pathname !== "/login") {
    window.location.replace(loginPath(window.location.pathname + window.location.search + window.location.hash));
  }
}

export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, { ...init, credentials: "same-origin", cache: "no-store" });
  redirectForUnauthorized(response.status);
  const result = await response.json().catch(() => null) as ApiResponse<T> | null;
  if (!response.ok || result?.code !== 0) {
    throw new ApiClientError(result?.message || "操作失败，请稍后重试", response.status);
  }
  return result.data as T;
}
