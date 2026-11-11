import { openApiDocument } from "@/lib/openapi";
import { apiRoute } from "@/lib/server-api";

const headers = { "Cache-Control": "private, no-store" };

export async function GET(request: Request) {
  return apiRoute(request, async () => Response.json(openApiDocument, { headers }));
}
