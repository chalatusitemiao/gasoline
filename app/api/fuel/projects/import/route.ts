import { importProjects, projectImportSchema } from "@/lib/fuel-server/projects";
import { body } from "@/lib/fuel-server/shared";
import { apiRoute } from "@/lib/server-api";

export function POST(request: Request) {
  return apiRoute(request, async () => importProjects(await body(request, projectImportSchema)), {
    permission: "archives:import",
  });
}
