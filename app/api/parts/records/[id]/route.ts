import { body, uuid } from "@/lib/fuel-server/shared";
import { partDeleteInputSchema, partRecordUpdateSchema } from "@/lib/parts";
import { deletePartRecord, getPartRecord, updatePartRecord } from "@/lib/parts-server/records";
import { apiRoute } from "@/lib/server-api";

type Context = { params: Promise<{ id: string }> };

export function GET(request: Request, { params }: Context) {
  return apiRoute(request, async (actor) => getPartRecord(uuid((await params).id), actor), { permission: "parts:view" });
}

export function PUT(request: Request, { params }: Context) {
  return apiRoute(request, async (actor) => updatePartRecord(
    uuid((await params).id), await body(request, partRecordUpdateSchema), actor,
  ), { permission: "parts:edit" });
}

export function DELETE(request: Request, { params }: Context) {
  return apiRoute(request, async (actor) => {
    const { reason } = await body(request, partDeleteInputSchema);
    return deletePartRecord(uuid((await params).id), reason, actor);
  }, { permission: "parts:delete" });
}
