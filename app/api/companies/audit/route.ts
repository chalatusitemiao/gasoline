import { listCompanyAuditLogs } from "@/lib/company-server";
import { requestQuery } from "@/lib/fuel-server/shared";
import { apiRoute } from "@/lib/server-api";

export function GET(request: Request) {
  return apiRoute(request, () => listCompanyAuditLogs(requestQuery(request)), { permission: "companies:manage" });
}
