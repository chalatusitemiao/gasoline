"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { AppNavigationProvider, type AppLinkProps, type AppNavigation } from "@/components/app-navigation";

function WebLink(props: AppLinkProps) {
  return <Link {...props} />;
}

export function WebNavigationProvider({ MenuLink, children }: { MenuLink?: AppNavigation["MenuLink"]; children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();

  return (
    <AppNavigationProvider navigation={{
      pathname,
      Link: WebLink,
      MenuLink,
      replace: (href) => router.replace(href),
      refresh: () => router.refresh(),
    }}>
      {children}
    </AppNavigationProvider>
  );
}
