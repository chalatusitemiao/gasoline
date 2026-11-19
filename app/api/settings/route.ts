import { apiResponse, apiRoute, clearSessionCookieHeaders } from "@/lib/server-api";
import { body } from "@/lib/fuel-server/shared";
import { hasPermission } from "@/lib/permissions";
import { getSystemSettings, getSystemSettingsSnapshot } from "@/lib/system-settings";
import { savePlatformSettings, platformSettingsInput } from "@/lib/system-settings-admin";
import { companySettingsInput, getCompanyBusinessSettings, saveCompanyBusinessSettings } from "@/lib/company-settings";

export function GET(request: Request) {
  return apiRoute(request, async (actor) => {
    if (actor.role === "super_admin") {
      const { authUrl, timeZone } = (await getSystemSettingsSnapshot()).settings;
      return { scope: "platform", authUrl, username: actor.name, timeZone };
    }
    const settings = await getSystemSettings();
    const basic = { scope: "company", companyId: actor.companyId, companyName: actor.companyName, username: actor.name, timeZone: settings.timeZone };
    return hasPermission(actor.permissions, "settings:manage")
      ? { ...basic, ...await getCompanyBusinessSettings(actor.companyId!), authUrl: "" }
      : basic;
  }, { permission: null });
}

export function PUT(request: Request) {
  return apiRoute(request, async (actor) => {
    if (actor.role === "super_admin") {
      const input = await body(request, platformSettingsInput);
      const { settings, revision } = await getSystemSettingsSnapshot();
      const result = await savePlatformSettings(input, settings, revision, actor);
      return apiResponse(200, result, "平台配置已保存", result.requireLogin ? clearSessionCookieHeaders() : undefined);
    }
    return saveCompanyBusinessSettings(await body(request, companySettingsInput), actor);
  }, { permission: null });
}
