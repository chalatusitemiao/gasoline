import { vehicleInputSchema } from "@/lib/fuel";
import { listVehicles, saveVehicle } from "@/lib/fuel-server/catalog";
import { body, requestQuery } from "@/lib/fuel-server/shared";
import { apiRoute } from "@/lib/server-api";

export function GET(request: Request) {
  return apiRoute(request, () => listVehicles(requestQuery(request)));
}

export function POST(request: Request) {
  return apiRoute(request, async () => saveVehicle(await body(request, vehicleInputSchema)), { status: 201 });
}
