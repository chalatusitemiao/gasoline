import { recentRecords } from "@/lib/fuel-server/records";
import { requestQuery, uuid } from "@/lib/fuel-server/shared";
import { apiRoute } from "@/lib/server-api";

type Context = { params: Promise<{ id: string }> };

export function GET(request: Request, { params }: Context) {
  return apiRoute(request, async () => recentRecords(uuid((await params).id), requestQuery(request)));
}
