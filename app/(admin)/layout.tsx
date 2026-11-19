import type { ReactNode } from "react";
import { AppQueryProvider } from "@/app/providers";
import { requirePageSession } from "@/lib/auth";
import { AdminShell } from "./admin-shell";
import { WebAdminNavigation } from "./web-admin-navigation";

export default async function AdminLayout({ children }: { children: ReactNode }) {
  const session = await requirePageSession();

  return (
    <AppQueryProvider key={`${session.user.id}:${session.user.companyId ?? "platform"}:${session.user.role}`}>
      <WebAdminNavigation userId={session.user.id} companyId={session.user.companyId} companyName={session.user.companyName} permissions={session.user.permissions}>
        <AdminShell name={session.user.name} permissions={session.user.permissions}>{children}</AdminShell>
      </WebAdminNavigation>
    </AppQueryProvider>
  );
}
