import { listDeletions } from "@/lib/fuel-server/records";
import { requestQuery } from "@/lib/fuel-server/shared";
import { apiRoute } from "@/lib/server-api";

export function GET(request: Request) {
  return apiRoute(request, () => listDeletions(requestQuery(request)));
}
