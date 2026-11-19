"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { AppNavigationProvider, type AppLinkProps, type AppNavigation } from "@/components/app-navigation";

function WebLink(props: AppLinkProps) {
  return <Link {...props} />;
}

export function WebNavigationProvider({ MenuLink, userId, companyId, companyName, permissions, children }: {
  MenuLink?: AppNavigation["MenuLink"];
  userId?: string;
  companyId?: string | null;
  companyName?: string | null;
  permissions?: AppNavigation["permissions"];
  children: ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();

  return (
    <AppNavigationProvider navigation={{
      pathname,
      userId,
      companyId,
      companyName,
      permissions,
      Link: WebLink,
      MenuLink,
      replace: (href) => router.replace(href),
      refresh: () => router.refresh(),
    }}>
      {children}
    </AppNavigationProvider>
  );
}
