import { NextResponse, type NextRequest } from "next/server";
import { returnToHeader } from "@/lib/login-path";

export function proxy(request: NextRequest) {
  const headers = new Headers(request.headers);
  const url = request.nextUrl.clone();
  url.searchParams.delete("_rsc");
  headers.set(returnToHeader, url.pathname + url.search);
  return NextResponse.next({ request: { headers } });
}

export const config = {
  matcher: [
    "/dashboard/:path*", "/refuel/:path*", "/records/:path*",
    "/vehicle-report/:path*", "/driver-report/:path*", "/costs/:path*",
    "/vehicles/:path*", "/drivers/:path*", "/import/:path*", "/docs/:path*", "/settings/:path*",
  ],
};
