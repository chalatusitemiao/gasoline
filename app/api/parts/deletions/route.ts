import { requestQuery } from "@/lib/fuel-server/shared";
import { listPartDeletions } from "@/lib/parts-server/records";
import { apiRoute } from "@/lib/server-api";

export function GET(request: Request) {
  return apiRoute(request, () => listPartDeletions(requestQuery(request)), { permission: "parts:delete" });
}
