import type { Metadata } from "next";
import { requirePageSession } from "@/lib/auth";
import { OperationDocs } from "./operation-docs";

export const metadata: Metadata = { title: "操作文档" };

export default async function OperationDocsPage() {
  const { user } = await requirePageSession("docs:view");
  return <OperationDocs role={user.role} />;
}
