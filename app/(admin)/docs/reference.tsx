"use client";

import { ApiReferenceReact } from "@scalar/api-reference-react";
import "@scalar/api-reference-react/style.css";
import type { ComponentProps } from "react";
import { redirectForUnauthorized } from "@/lib/api-client";

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
    const response = await fetch(input, { ...init, credentials: "same-origin", mode: "same-origin" });
    if (!response.url.endsWith("/api/login")) redirectForUnauthorized(response.status);
    return response;
  },
} satisfies ComponentProps<typeof ApiReferenceReact>["configuration"];

export function Reference() {
  return <ApiReferenceReact configuration={configuration} />;
}
