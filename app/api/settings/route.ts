import { apiResponse, apiRoute, clearSessionCookieHeaders } from "@/lib/server-api";
import { body } from "@/lib/fuel-server/shared";
import { hasPermission } from "@/lib/permissions";
import { getSystemSettings, getSystemSettingsSnapshot } from "@/lib/system-settings";
import { saveSystemSettings, settingsInput, settingsView } from "@/lib/system-settings-admin";

export function GET(request: Request) {
  return apiRoute(request, async (actor) => {
    const settings = await getSystemSettings();
    return hasPermission(actor.permissions, "settings:manage")
      ? { ...settingsView(settings), username: actor.name }
      : { username: actor.name, timeZone: settings.timeZone };
  });
}

export function PUT(request: Request) {
  return apiRoute(request, async () => {
    const input = await body(request, settingsInput);
    const { settings, revision } = await getSystemSettingsSnapshot();
    const result = await saveSystemSettings(input, settings, revision);
    return apiResponse(200, result, "系统配置已保存", result.requireLogin ? clearSessionCookieHeaders() : undefined);
  }, { permission: "settings:manage" });
}
