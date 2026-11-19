import type { Metadata } from "next";
import { requirePageSession } from "@/lib/auth";
import { UserManagement } from "@/components/user-management";

export const metadata: Metadata = { title: "账号管理" };

export default async function UsersPage({ searchParams }: { searchParams: Promise<{ companyId?: string }> }) {
  await requirePageSession("users:manage");
  return <UserManagement initialCompanyId={(await searchParams).companyId} />;
}
