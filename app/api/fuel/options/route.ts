import { getFuelOptions } from "@/lib/fuel-server/catalog";
import { apiRoute } from "@/lib/server-api";

export function GET(request: Request) {
  return apiRoute(request, getFuelOptions);
}
