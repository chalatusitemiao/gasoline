import { driverInputSchema } from "@/lib/fuel";
import { listDrivers, saveDriver } from "@/lib/fuel-server/catalog";
import { body, requestQuery } from "@/lib/fuel-server/shared";
import { apiRoute } from "@/lib/server-api";

export function GET(request: Request) {
  return apiRoute(request, () => listDrivers(requestQuery(request)));
}

export function POST(request: Request) {
  return apiRoute(request, async () => saveDriver(await body(request, driverInputSchema)), { status: 201 });
}
