import "server-only";

import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { betterAuth } from "better-auth";
import { APIError, createAuthEndpoint } from "better-auth/api";
import { setSessionCookie } from "better-auth/cookies";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { getDatabaseUrl, getDb } from "./db";
import { account, session, user, verification } from "./db/schema";
import { authorizeFuelAccount, fleetAccountId, getRegistrationKey } from "./fuel-credentials";
import { loginErrorMessage, loginSchema } from "./login-contract";
import { loginPath, returnToHeader } from "./login-path";
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
    advanced: { database: { joins: true } },
    session: { expiresIn: 12 * 60 * 60, disableSessionRefresh: true },
    plugins: [{
      id: "gasoline-single-account",
      endpoints: {
        loginFuelAccount: createAuthEndpoint("/fuel-login", {
          method: "POST",
          body: loginSchema,
        }, async (ctx) => {
          const accountUser = await authorizeFuelAccount(ctx.body.username, ctx.body.password);
          if (!accountUser) {
            throw new APIError("UNAUTHORIZED", { message: loginErrorMessage });
          }
          const session = await ctx.context.internalAdapter.createSession(accountUser.id);
          if (!session) throw new APIError("INTERNAL_SERVER_ERROR");
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
  if (!getDatabaseUrl() || !hasFleetAccount(await getSystemSettings())) return null;
  const instance = await getAuth(requestHeaders, requestUrl);
  try {
    const result = await instance.api.getSession({ headers: requestHeaders });
    return result?.user.id === fleetAccountId ? result : null;
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
    const hasAccount = hasFleetAccount(await getSystemSettings());
    return {
      registrationUnavailable: hasAccount
        ? "系统已有后台账号，请直接登录。"
        : getRegistrationKey() ? null : "当前环境未启用注册，请联系管理员。",
      session: hasAccount ? await getRequestSession(requestHeaders) : null,
    };
  });
});

export async function getSession() {
  return (await getPageSession()).session;
}

export async function requirePageSession() {
  const { session } = await getPageSession();
  if (!session) redirect(loginPath((await headers()).get(returnToHeader)));
  return session;
}
