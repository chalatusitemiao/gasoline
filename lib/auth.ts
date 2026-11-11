import "server-only";

import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { betterAuth } from "better-auth";
import { APIError, createAuthEndpoint } from "better-auth/api";
import { setSessionCookie } from "better-auth/cookies";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { getDb } from "./db";
import { account, session, user, verification } from "./db/schema";
import { authorizeFuelAccount, fleetAccountId } from "./fuel-credentials";
import { loginErrorMessage, loginSchema } from "./login-contract";
import { loginPath, returnToHeader } from "./login-path";
import { getSystemSettings, isSystemConfigured, withSystemSettings } from "./system-settings";
import { getAuthSecret } from "./system-settings-store";

export function getRequestOrigin(requestHeaders: Headers, requestUrl?: string) {
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
    database: drizzleAdapter(db, {
      provider: "pg",
      schema: { user, session, account, verification },
      transaction: true,
    }),
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
  if (!isSystemConfigured(await getSystemSettings())) return null;
  const instance = await getAuth(requestHeaders, requestUrl);
  const result = await instance.api.getSession({ headers: requestHeaders });
  return result?.user.id === fleetAccountId ? result : null;
}

export const getPageSession = cache(async () => {
  const requestHeaders = await headers();
  return withSystemSettings(async () => {
    const configured = isSystemConfigured(await getSystemSettings());
    return { configured, session: configured ? await getRequestSession(requestHeaders) : null };
  });
});

export async function getSession() {
  return (await getPageSession()).session;
}

export async function requirePageSession() {
  const { configured, session } = await getPageSession();
  if (!configured) redirect("/setup");
  if (!session) redirect(loginPath((await headers()).get(returnToHeader)));
  return session;
}
