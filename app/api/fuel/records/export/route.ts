import { exportRecords } from "@/lib/fuel-server/records";
import { requestQuery } from "@/lib/fuel-server/shared";
import { apiRoute } from "@/lib/server-api";

export function GET(request: Request) {
  return apiRoute(request, async () => {
    const rows = await exportRecords(requestQuery(request));
    const encoder = new TextEncoder();
    let index = 0;

    // Stream a single JSON response without buffering its serialized body.
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoder.encode('{"code":0,"data":['));
      },
      pull(controller) {
        if (index >= rows.length) {
          controller.enqueue(encoder.encode('],"message":"操作成功"}'));
          controller.close();
          return;
        }
        const chunk = rows.slice(index, index + 250).map((row) => JSON.stringify(row)).join(",");
        controller.enqueue(encoder.encode(index === 0 ? chunk : `,${chunk}`));
        index += 250;
      },
    });
    return new Response(body, {
      headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "private, no-store" },
    });
  });
}
