import { fuelImportSchema, importFuel } from "@/lib/fuel-server/import";
import { body } from "@/lib/fuel-server/shared";
import { apiRoute } from "@/lib/server-api";

export function POST(request: Request) {
  return apiRoute(request, async (actor) => importFuel(await body(request, fuelImportSchema), actor));
}
