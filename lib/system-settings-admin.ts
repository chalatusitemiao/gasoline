import "server-only";

import { z } from "zod";
import { ApiError } from "./server-api";
import { isBusinessTimeZone, type SystemSettings } from "./system-settings";
import { SettingsConflictError, writeStoredSettings } from "./system-settings-store";

function validUrl(value: string, protocols: string[]) {
  if (!value) return true;
  try {
    const url = new URL(value);
    return Boolean(url.hostname) && protocols.includes(url.protocol);
  } catch {
    return false;
  }
}

export const settingsInput = z.object({
  authUrl: z.string().trim().max(2048)
    .refine((value) => validUrl(value, ["http:", "https:"]), "站点地址必须是 HTTP 或 HTTPS 地址")
    .transform((value) => value ? new URL(value).origin : "")
    .optional(),
  timeZone: z.string().trim().max(128).refine(isBusinessTimeZone, "请选择有效的业务时区"),
  baselineSamples: z.number().int().min(2).max(100),
  anomalyMultiplier: z.number().min(1).max(100),
});

export function settingsView(settings: SystemSettings) {
  return {
    authUrl: settings.authUrl,
    username: settings.username,
    timeZone: settings.timeZone,
    baselineSamples: settings.baselineSamples,
    anomalyMultiplier: settings.anomalyMultiplier,
  };
}

export async function saveSystemSettings(
  input: z.infer<typeof settingsInput>,
  current: SystemSettings,
  revision: string | null,
) {
  const settings: SystemSettings = {
    authUrl: input.authUrl ?? current.authUrl,
    username: current.username,
    passwordHash: current.passwordHash,
    timeZone: input.timeZone,
    baselineSamples: input.baselineSamples,
    anomalyMultiplier: input.anomalyMultiplier,
  };

  try {
    await writeStoredSettings(settings, revision);
  } catch (error) {
    if (error instanceof SettingsConflictError) {
      throw new ApiError(409, "系统配置已发生变化，请刷新后重试");
    }
    throw error;
  }

  return {
    ...settingsView(settings),
    requireLogin: settings.authUrl !== current.authUrl,
  };
}
