import type { Metadata } from "next";
import { requirePageSession } from "@/lib/auth";
import { CalculationDocs } from "./calculation-docs";

export const metadata: Metadata = { title: "计算文档" };

export default async function CalculationDocsPage() {
  await requirePageSession();
  return <CalculationDocs />;
}
