import type { ReactNode } from "react";
import { AppQueryProvider } from "@/app/providers";
import { requirePageSession } from "@/lib/auth";
import { AdminShell } from "./admin-shell";
import { WebAdminNavigation } from "./web-admin-navigation";

export default async function AdminLayout({ children }: { children: ReactNode }) {
  const session = await requirePageSession();

  return (
    <AppQueryProvider key={session.user.id}>
      <WebAdminNavigation>
        <AdminShell name={session.user.name}>{children}</AdminShell>
      </WebAdminNavigation>
    </AppQueryProvider>
  );
}
