import { vehicleInputSchema } from "@/lib/fuel";
import { listVehicles, saveVehicle } from "@/lib/fuel-server/catalog";
import { body, requestQuery } from "@/lib/fuel-server/shared";
import { apiRoute } from "@/lib/server-api";

export function GET(request: Request) {
  return apiRoute(request, (actor) => listVehicles(
    requestQuery(request), actor.permissions.includes("archives:purchase-price"),
  ), { permission: "archives:view" });
}

export function POST(request: Request) {
  return apiRoute(request, async (actor) => saveVehicle(
    await body(request, vehicleInputSchema), undefined, actor.permissions.includes("archives:purchase-price"),
  ), {
    status: 201,
    permission: "archives:manage",
  });
}
