import "server-only";

import { AsyncLocalStorage } from "node:async_hooks";
import { ApiError } from "./api-error";

const companyContext = new AsyncLocalStorage<{ companyId: string | null }>();

export function getCompanyContext() {
  return companyContext.getStore();
}

export function withCompanyContext<T>(companyId: string | null, action: () => Promise<T>): Promise<T> {
  return companyContext.run({ companyId }, action);
}

export async function requireCompanyId() {
  const context = getCompanyContext();
  if (context) {
    if (!context.companyId) throw new ApiError(403, "平台账号不能访问公司业务数据");
    return context.companyId;
  }
  const { getSession } = await import("./auth");
  const session = await getSession();
  if (!session) throw new ApiError(401, "请先登录");
  if (session.user.role === "super_admin" || !session.user.companyId) {
    throw new ApiError(403, "平台账号不能访问公司业务数据");
  }
  return session.user.companyId;
}
