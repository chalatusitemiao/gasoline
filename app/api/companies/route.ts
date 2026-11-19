import { createCompany, createCompanySchema, listCompanies } from "@/lib/company-server";
import { body, requestQuery } from "@/lib/fuel-server/shared";
import { apiRoute } from "@/lib/server-api";

export function GET(request: Request) {
  return apiRoute(request, () => listCompanies(requestQuery(request)), { permission: "companies:manage" });
}

export function POST(request: Request) {
  return apiRoute(request, async (actor) => createCompany(await body(request, createCompanySchema), actor), { permission: "companies:manage", status: 201 });
}
