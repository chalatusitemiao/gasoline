import { uuid } from "@/lib/fuel-server/shared";
import { getPartPhoto } from "@/lib/parts-server/photos";
import { apiRoute } from "@/lib/server-api";

export function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return apiRoute(request, async (actor) => getPartPhoto(uuid((await params).id), actor), { permission: "parts:view" });
}
