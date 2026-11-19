import { updateCompany, updateCompanyExpirySchema, updateCompanySchema } from "@/lib/company-server";
import { body, uuid } from "@/lib/fuel-server/shared";
import { apiRoute } from "@/lib/server-api";

type Context = { params: Promise<{ id: string }> };

export function PUT(request: Request, { params }: Context) {
  return apiRoute(request, async (actor) => updateCompany(uuid((await params).id), await body(request, updateCompanySchema), actor), { permission: "companies:manage" });
}

export function PATCH(request: Request, { params }: Context) {
  return apiRoute(request, async (actor) => updateCompany(uuid((await params).id), await body(request, updateCompanyExpirySchema), actor), { permission: "companies:manage" });
}
