import type { Metadata } from "next";
import { CompanyManagement } from "@/components/company-management";
import { requirePageSession } from "@/lib/auth";

export const metadata: Metadata = { title: "公司管理" };

export default async function CompaniesPage() {
  await requirePageSession("companies:manage");
  return <CompanyManagement />;
}
