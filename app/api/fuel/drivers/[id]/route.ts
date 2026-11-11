import { driverInputSchema } from "@/lib/fuel";
import { deleteDriver, getDriver, saveDriver } from "@/lib/fuel-server/catalog";
import { body, uuid } from "@/lib/fuel-server/shared";
import { apiRoute } from "@/lib/server-api";

type Context = { params: Promise<{ id: string }> };

export function GET(request: Request, { params }: Context) {
  return apiRoute(request, async () => getDriver(uuid((await params).id)));
}

export function PUT(request: Request, { params }: Context) {
  return apiRoute(request, async () => saveDriver(await body(request, driverInputSchema), uuid((await params).id)));
}

export function DELETE(request: Request, { params }: Context) {
  return apiRoute(request, async () => deleteDriver(uuid((await params).id)));
}
