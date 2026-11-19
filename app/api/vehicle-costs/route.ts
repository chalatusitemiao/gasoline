import { parse, requestQuery } from "@/lib/fuel-server/shared";
import { apiRoute } from "@/lib/server-api";
import { getVehicleCosts, vehicleCostQuery } from "@/lib/vehicle-costs-server";

export async function GET(request: Request) {
  return apiRoute(request, async () => getVehicleCosts(parse(vehicleCostQuery, requestQuery(request))), {
    permission: "reports:vehicle-costs",
  });
}
