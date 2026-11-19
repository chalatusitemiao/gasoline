import "server-only";

import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { betterAuth } from "better-auth";
import { APIError, createAuthEndpoint } from "better-auth/api";
import { setSessionCookie } from "better-auth/cookies";
import { eq } from "drizzle-orm";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { companyBillingDenials, companyBillingStatus } from "./company-access";
import { getDatabaseUrl, getDb } from "./db";
import { account, session, user, verification } from "./db/schema";
import { companies } from "./db/company-schema";
import { authorizeFuelAccount, ensureLegacyFuelAccountMigrated, getRegistrationKey, hasRegisteredFuelAccount } from "./fuel-credentials";
import { loginErrorMessage, loginSchema } from "./login-contract";
import { loginPath, returnToHeader } from "./login-path";
import { hasPermission, isUserRole, permissionsForRole, type Permission } from "./permissions";
import { getSystemSettings, hasFleetAccount, withSystemSettings } from "./system-settings";
import { getAuthSecret } from "./system-settings-store";

function getRequestOrigin(requestHeaders: Headers, requestUrl?: string) {
  const url = requestUrl ? URL.parse(requestUrl) : null;
  const host = requestHeaders.get("host") ?? url?.host;
  const protocol = requestHeaders.get("x-forwarded-proto")
    ?? url?.protocol.slice(0, -1)
    ?? (process.env.VERCEL ? "https" : "http");
  if (!host || /[\s,/?#@\\]/.test(host) || (protocol !== "http" && protocol !== "https")) {
    return null;
  }

  return URL.parse(`${protocol}://${host}`)?.origin ?? null;
}

export async function getAuthOrigin(requestHeaders: Headers, requestUrl?: string) {
  const { authUrl } = await getSystemSettings();
  return authUrl ? new URL(authUrl).origin : getRequestOrigin(requestHeaders, requestUrl);
}

function createAuth(origin: string, db: Awaited<ReturnType<typeof getDb>>) {
  return betterAuth({
    appName: "Gasoline",
    baseURL: origin,
    secret: getAuthSecret(),
    logger: {
      level: "error",
      log: () => console.error("认证服务处理失败"),
    },
    database: drizzleAdapter(db, {
      provider: "pg",
      schema: { user, session, account, verification },
      transaction: true,
    }),
    user: {
      additionalFields: {
        username: { type: "string", required: true, input: false },
      },
    },
    advanced: { database: { joins: true } },
    session: { expiresIn: 12 * 60 * 60, disableSessionRefresh: true },
    plugins: [{
      id: "gasoline-single-account",
      endpoints: {
        loginFuelAccount: createAuthEndpoint("/fuel-login", {
          method: "POST",
          body: loginSchema,
        }, async (ctx) => {
          const authorization = await authorizeFuelAccount(ctx.body.username, ctx.body.password);
          if (!authorization) {
            throw new APIError("UNAUTHORIZED", { message: loginErrorMessage });
          }
          if ("billingStatus" in authorization) {
            throw new APIError("FORBIDDEN", companyBillingDenials[authorization.billingStatus]);
          }
          const { accountUser } = authorization;
          const session = await ctx.context.internalAdapter.createSession(accountUser.id);
          if (!session) throw new APIError("INTERNAL_SERVER_ERROR");
          if (accountUser.role === "super_admin") {
            // 改名与登录并行时，旧用户名创建的会话也必须作废。
            const [current] = await db.select({ username: user.username }).from(user).where(eq(user.id, accountUser.id));
            if (current?.username !== accountUser.username) {
              await ctx.context.internalAdapter.deleteSession(session.token);
              throw new APIError("UNAUTHORIZED", { message: loginErrorMessage });
            }
          }
          await setSessionCookie(ctx, { session, user: accountUser });
          return ctx.json({ name: accountUser.name });
        }),
      },
    }],
  });
}

let auth: {
  origin: string;
  db: Awaited<ReturnType<typeof getDb>>;
  instance: ReturnType<typeof createAuth>;
} | undefined;

export async function getAuth(requestHeaders: Headers, requestUrl?: string) {
  const origin = await getAuthOrigin(requestHeaders, requestUrl);
  if (!origin) throw new Error("无法识别站点访问地址");
  const db = await getDb();
  if (!auth || auth.origin !== origin || auth.db !== db) {
    auth = { origin, db, instance: createAuth(origin, db) };
  }
  return auth.instance;
}

export async function getRequestSession(requestHeaders: Headers, requestUrl?: string) {
  if (!getDatabaseUrl()) return null;
  if (!await hasRegisteredFuelAccount() && !hasFleetAccount(await getSystemSettings())) return null;
  const instance = await getAuth(requestHeaders, requestUrl);
  try {
    const result = await instance.api.getSession({ headers: requestHeaders });
    if (!result) return null;
    await ensureLegacyFuelAccountMigrated(result.user.id);
    const db = await getDb();
    const [accountUser] = await db.select({
      id: user.id,
      name: user.name,
      username: user.username,
      role: user.role,
      isActive: user.isActive,
      companyId: user.companyId,
      company: {
        name: companies.name,
        isActive: companies.isActive,
        billingRequired: companies.billingRequired,
        paidUntil: companies.paidUntil,
      },
    }).from(user).leftJoin(companies, eq(user.companyId, companies.id))
      .where(eq(user.id, result.user.id)).limit(1);
    if (!accountUser?.isActive || !isUserRole(accountUser.role)) return null;
    const { company } = accountUser;
    if (accountUser.role === "super_admin") {
      if (accountUser.companyId !== null) return null;
    } else {
      if (!accountUser.companyId || !company?.isActive) return null;
      const billingStatus = companyBillingStatus(company.billingRequired, company.paidUntil);
      if (billingStatus === "pending" || billingStatus === "expired") return null;
    }
    return {
      ...result,
      user: {
        ...result.user,
        name: accountUser.name,
        username: accountUser.username,
        role: accountUser.role,
        companyId: accountUser.companyId,
        companyName: company?.name ?? null,
        permissions: permissionsForRole(accountUser.role),
      },
    };
  } catch {
    // Auth adapter errors can contain the session token as a query parameter.
    throw new Error("登录会话暂时无法读取");
  }
}

export const getPageSession = cache(async () => {
  const requestHeaders = await headers();
  return withSystemSettings(async () => {
    if (!getDatabaseUrl()) {
      return { registrationUnavailable: "数据库尚未配置，请联系管理员。", session: null };
    }
    const hasAccount = await hasRegisteredFuelAccount() || hasFleetAccount(await getSystemSettings());
    return {
      registrationUnavailable: hasAccount
        ? "超级管理员已初始化，请直接登录。公司账号请联系管理员创建。"
        : getRegistrationKey() ? null : "当前环境未启用注册，请联系管理员。",
      session: hasAccount ? await getRequestSession(requestHeaders) : null,
    };
  });
});

export async function getSession() {
  return (await getPageSession()).session;
}

export async function requirePageSession(requiredPermission?: Permission) {
  const { session } = await getPageSession();
  if (!session) redirect(loginPath((await headers()).get(returnToHeader)));
  if (requiredPermission && !hasPermission(session.user.permissions, requiredPermission)) {
    redirect("/dashboard");
  }
  return session;
}
