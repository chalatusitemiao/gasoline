"use client";

import { ApiReferenceReact } from "@scalar/api-reference-react";
import "@scalar/api-reference-react/style.css";
import type { ComponentProps } from "react";
import { apiRequest, redirectForUnauthorized } from "@/lib/api-client";

const configuration = {
  url: "/api/openapi",
  localization: { locale: "zh-CN" },
  hideClientButton: true,
  showSidebar: false,
  showDeveloperTools: "never",
  proxyUrl: "",
  persistAuth: false,
  telemetry: false,
  withDefaultFonts: false,
  customFetch: async (input: string | URL | Request, init?: RequestInit) => {
    const response = await apiRequest(input, { ...init, mode: "same-origin" });
    const target = response.url || (input instanceof Request ? input.url : input.toString());
    if (!target.endsWith("/api/login")) redirectForUnauthorized(response.status, input);
    return response;
  },
} satisfies ComponentProps<typeof ApiReferenceReact>["configuration"];

export function Reference() {
  return <ApiReferenceReact configuration={configuration} />;
}
