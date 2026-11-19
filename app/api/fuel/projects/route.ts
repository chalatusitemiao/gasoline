import { projectInputSchema } from "@/lib/fleet-project";
import { listProjects, saveProject } from "@/lib/fuel-server/projects";
import { body, requestQuery } from "@/lib/fuel-server/shared";
import { apiRoute } from "@/lib/server-api";

export function GET(request: Request) {
  return apiRoute(request, () => listProjects(requestQuery(request)), { permission: "archives:view" });
}

export function POST(request: Request) {
  return apiRoute(request, async () => saveProject(await body(request, projectInputSchema)), {
    permission: "archives:manage", status: 201,
  });
}
