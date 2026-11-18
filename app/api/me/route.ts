import { apiRoute } from "@/lib/server-api";
import { getSystemSettings } from "@/lib/system-settings";

export function GET(request: Request) {
  return apiRoute(request, async (actor) => {
    const { timeZone } = await getSystemSettings();
    return {
      id: actor.id,
      name: actor.name,
      role: actor.role,
      permissions: actor.permissions,
      timeZone,
    };
  }, { permission: null });
}
