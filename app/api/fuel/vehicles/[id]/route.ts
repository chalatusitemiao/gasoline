import { vehicleInputSchema } from "@/lib/fuel";
import { deleteVehicle, getVehicle, saveVehicle } from "@/lib/fuel-server/catalog";
import { body, uuid } from "@/lib/fuel-server/shared";
import { apiRoute } from "@/lib/server-api";

type Context = { params: Promise<{ id: string }> };

export function GET(request: Request, { params }: Context) {
  return apiRoute(request, async () => getVehicle(uuid((await params).id)));
}

export function PUT(request: Request, { params }: Context) {
  return apiRoute(request, async () => saveVehicle(await body(request, vehicleInputSchema), uuid((await params).id)));
}

export function DELETE(request: Request, { params }: Context) {
  return apiRoute(request, async () => deleteVehicle(uuid((await params).id)));
}
