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

export function getAuthOrigin() {
  const url = process.env.BETTER_AUTH_URL;
  if (!url) throw new Error("请设置 BETTER_AUTH_URL");

  const parsed = new URL(url);
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("BETTER_AUTH_URL 必须是 HTTP 或 HTTPS 地址");
  }

  return parsed.origin;
}

function createAuth() {
  const secret = process.env.BETTER_AUTH_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error("请设置至少 32 个字符的 BETTER_AUTH_SECRET");
  }

  return betterAuth({
    appName: "Gasoline",
    baseURL: getAuthOrigin(),
    secret,
    database: drizzleAdapter(getDb(), {
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

let auth: ReturnType<typeof createAuth> | undefined;

export function getAuth() {
  return (auth ??= createAuth());
}

export async function getRequestSession(requestHeaders: Headers) {
  const result = await getAuth().api.getSession({ headers: requestHeaders });
  return result?.user.id === fleetAccountId ? result : null;
}

export const getSession = cache(async () => getRequestSession(await headers()));

export async function requirePageSession() {
  const result = await getSession();
  if (!result) redirect(loginPath((await headers()).get(returnToHeader)));
  return result;
}
