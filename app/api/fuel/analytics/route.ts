import { z } from "zod";
import { monthInBusinessZone } from "@/lib/fuel-calendar";
import { shiftMonth } from "@/lib/fuel-analytics";
import { getFuelAnalytics } from "@/lib/fuel-analytics-server";
import { apiRoute, ApiError } from "@/lib/server-api";
import { getSystemSettings } from "@/lib/system-settings";

const month = z.string().regex(/^(?!0000)\d{4}-(0[1-9]|1[0-2])$/);
const analyticsQuery = z.object({
  view: z.enum(["dashboard", "vehicles", "drivers", "costs"]).default("dashboard"),
  from: month.optional(),
  to: month.optional(),
});

export async function GET(request: Request) {
  return apiRoute(request, async () => {
    const search = new URL(request.url).searchParams;
    const parsed = analyticsQuery.safeParse({
      view: search.get("view") ?? undefined,
      from: search.get("from") ?? undefined,
      to: search.get("to") ?? undefined,
    });
    if (!parsed.success) throw new ApiError(400, "请选择有效的月份区间");

    const { timeZone } = await getSystemSettings();
    const currentMonth = monthInBusinessZone(timeZone);
    const { view } = parsed.data;
    const to = view === "dashboard" ? currentMonth : parsed.data.to ?? currentMonth;
    const from = view === "dashboard" ? shiftMonth(currentMonth, -5) : parsed.data.from ?? to;
    if (from > to) throw new ApiError(400, "起始月份不能晚于结束月份");

    return getFuelAnalytics(view, from, to, currentMonth);
  });
}
