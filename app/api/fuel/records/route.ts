import { fuelRecordInputSchema } from "@/lib/fuel";
import { createRecord, listRecords } from "@/lib/fuel-server/records";
import { body, requestQuery } from "@/lib/fuel-server/shared";
import { apiRoute } from "@/lib/server-api";

export function GET(request: Request) {
  return apiRoute(request, () => listRecords(requestQuery(request)));
}

export function POST(request: Request) {
  return apiRoute(request, async (actor) => createRecord(await body(request, fuelRecordInputSchema), actor), {
    status: 201,
  });
}
