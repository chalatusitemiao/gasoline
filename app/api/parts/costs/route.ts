import { requireCompanyId } from "@/lib/company-context";
import { getCompanyBusinessSettings } from "@/lib/company-settings";
import { monthInBusinessZone } from "@/lib/fuel-calendar";
import { parse, requestQuery } from "@/lib/fuel-server/shared";
import { apiRoute } from "@/lib/server-api";
import { getPartCosts, partCostQuery } from "@/lib/vehicle-costs-server";

export async function GET(request: Request) {
  return apiRoute(request, async () => {
    const query = parse(partCostQuery, requestQuery(request));
    const { timeZone } = await getCompanyBusinessSettings(await requireCompanyId());
    return getPartCosts(query, monthInBusinessZone(timeZone));
  }, { permission: "reports:view" });
}
