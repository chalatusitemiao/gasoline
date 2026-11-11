import { importVehicles, vehicleImportSchema } from "@/lib/fuel-server/catalog";
import { body } from "@/lib/fuel-server/shared";
import { apiRoute } from "@/lib/server-api";

export function POST(request: Request) {
  return apiRoute(request, async () => importVehicles(await body(request, vehicleImportSchema)));
}
