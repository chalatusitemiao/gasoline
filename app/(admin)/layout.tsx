import type { ReactNode } from "react";
import { AppQueryProvider } from "@/app/providers";
import { requirePageSession } from "@/lib/auth";
import { AdminShell } from "./admin-shell";

export default async function AdminLayout({ children }: { children: ReactNode }) {
  const session = await requirePageSession();

  return (
    <AppQueryProvider key={session.user.id}>
      <AdminShell name={session.user.name}>
        {children}
      </AdminShell>
    </AppQueryProvider>
  );
}
