import { body, requestQuery } from "@/lib/fuel-server/shared";
import { partRecordInputSchema } from "@/lib/parts";
import { createPartRecord, listPartRecords } from "@/lib/parts-server/records";
import { apiRoute } from "@/lib/server-api";

export function GET(request: Request) {
  return apiRoute(request, () => listPartRecords(requestQuery(request)), { permission: "parts:view" });
}

export function POST(request: Request) {
  return apiRoute(request, async (actor) => createPartRecord(await body(request, partRecordInputSchema), actor), {
    permission: "parts:create", status: 201,
  });
}
