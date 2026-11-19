import { updateCompany, updateCompanySchema } from "@/lib/company-server";
import { body, uuid } from "@/lib/fuel-server/shared";
import { apiRoute } from "@/lib/server-api";

export function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return apiRoute(request, async (actor) => updateCompany(uuid((await params).id), await body(request, updateCompanySchema), actor), { permission: "companies:manage" });
}
