import { getProjectOptions } from "@/lib/fuel-server/projects";
import { apiRoute } from "@/lib/server-api";

export function GET(request: Request) {
  return apiRoute(request, getProjectOptions, { permission: "archives:view" });
}
