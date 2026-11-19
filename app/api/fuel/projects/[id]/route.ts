import { projectInputSchema } from "@/lib/fleet-project";
import { getProject, saveProject } from "@/lib/fuel-server/projects";
import { body, uuid } from "@/lib/fuel-server/shared";
import { apiRoute } from "@/lib/server-api";

type Context = { params: Promise<{ id: string }> };

export function GET(request: Request, { params }: Context) {
  return apiRoute(request, async () => getProject(uuid((await params).id)), { permission: "archives:view" });
}

export function PUT(request: Request, { params }: Context) {
  return apiRoute(request, async () => saveProject(await body(request, projectInputSchema), uuid((await params).id)), {
    permission: "archives:manage",
  });
}
