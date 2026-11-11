import type { Metadata } from "next";
import { requirePageSession } from "@/lib/auth";
import { LedgerImport } from "./ledger-import";

export const metadata: Metadata = { title: "数据导入" };

export default async function LedgerImportPage() {
  await requirePageSession();
  return <LedgerImport />;
}
