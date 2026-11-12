import type { Metadata } from "next";
import { requirePageSession } from "@/lib/auth";
import { ApiDocs } from "./api-docs";

export const metadata: Metadata = { title: "接口文档" };

export default async function DocsPage() {
  await requirePageSession();
  return <ApiDocs />;
}
