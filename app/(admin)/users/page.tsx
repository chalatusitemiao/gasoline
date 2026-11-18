import type { Metadata } from "next";
import { requirePageSession } from "@/lib/auth";
import { UserManagement } from "@/components/user-management";

export const metadata: Metadata = { title: "账号管理" };

export default async function UsersPage() {
  await requirePageSession("users:manage");
  return <UserManagement />;
}
