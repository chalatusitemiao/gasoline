import "server-only";

import { z } from "zod";
import { getDb } from "./db";
import { companyAuditLogs } from "./db/company-schema";
import { session } from "./db/schema";
import { ApiError } from "./api-error";
import type { ApiActor } from "./server-api";
import type { SystemSettings } from "./system-settings";
import { SettingsConflictError, writeStoredSettings } from "./system-settings-store";

export const platformSettingsInput = z.object({
  authUrl: z.string().trim().max(2048).refine((value) => {
    if (!value) return true;
    try { return ["http:", "https:"].includes(new URL(value).protocol); } catch { return false; }
  }, "站点地址必须是 HTTP 或 HTTPS 地址").transform((value) => value ? new URL(value).origin : ""),
}).strict();

export async function savePlatformSettings(
  input: z.output<typeof platformSettingsInput>, current: SystemSettings, revision: string | null, actor: ApiActor,
) {
  if (actor.role !== "super_admin") throw new ApiError(403, "只有超级管理员可以修改平台配置");
  const requireLogin = input.authUrl !== current.authUrl;
  const db = await getDb();
  try {
    await db.transaction(async (tx) => {
      await writeStoredSettings({ ...current, authUrl: input.authUrl }, revision, tx);
      if (requireLogin) await tx.delete(session);
      await tx.insert(companyAuditLogs).values({
        companyId: null, actorId: actor.id, actorName: actor.name, action: "platform.settings_update", targetId: "fleet",
        details: { before: { authUrl: current.authUrl }, after: input },
      });
    });
  } catch (error) {
    if (error instanceof SettingsConflictError) throw new ApiError(409, "平台配置已发生变化，请刷新后重试");
    throw error;
  }
  return { scope: "platform" as const, authUrl: input.authUrl, username: actor.name, timeZone: current.timeZone, requireLogin };
}
