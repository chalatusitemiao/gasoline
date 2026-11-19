import { companyRenewalSchema, listCompanyRenewals, recordCompanyRenewal } from "@/lib/company-billing";
import { body, requestQuery, uuid } from "@/lib/fuel-server/shared";
import { apiRoute } from "@/lib/server-api";

type RouteContext = { params: Promise<{ id: string }> };

export function GET(request: Request, { params }: RouteContext) {
  return apiRoute(request, async () => listCompanyRenewals(uuid((await params).id), requestQuery(request)), { permission: "companies:manage" });
}

export function POST(request: Request, { params }: RouteContext) {
  return apiRoute(request, async (actor) => recordCompanyRenewal(uuid((await params).id), await body(request, companyRenewalSchema), actor), { permission: "companies:manage", status: 201 });
}
