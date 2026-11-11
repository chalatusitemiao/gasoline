import { z } from "zod";
import { fuelRecordUpdateSchema } from "@/lib/fuel";
import { deleteRecord, recordDetail, updateRecord } from "@/lib/fuel-server/records";
import { body, uuid } from "@/lib/fuel-server/shared";
import { apiRoute } from "@/lib/server-api";

type Context = { params: Promise<{ id: string }> };
const deletionInput = z.object({
  reason: z.string().trim().max(500).refine((value) => !value.includes("\u0000"), "删除原因包含无效字符").default(""),
});

export function GET(request: Request, { params }: Context) {
  return apiRoute(request, async () => recordDetail(uuid((await params).id)));
}

export function PUT(request: Request, { params }: Context) {
  return apiRoute(request, async (actor) => updateRecord(
    uuid((await params).id),
    await body(request, fuelRecordUpdateSchema),
    actor,
  ));
}

export function DELETE(request: Request, { params }: Context) {
  return apiRoute(request, async (actor) => {
    const { reason } = await body(request, deletionInput, true);
    return deleteRecord(uuid((await params).id), reason, actor);
  });
}
