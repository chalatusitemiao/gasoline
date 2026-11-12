"use client";

import { createContext, useContext, type ComponentPropsWithoutRef, type ComponentType, type ReactNode } from "react";

export type AppLinkProps = Omit<ComponentPropsWithoutRef<"a">, "href"> & { href: string };

export type AppNavigation = {
  pathname: string;
  Link: ComponentType<AppLinkProps>;
  MenuLink?: ComponentType<AppLinkProps>;
  replace: (href: string) => void;
  refresh: () => void;
  onSessionEnded?: () => void | Promise<void>;
};

const NavigationContext = createContext<AppNavigation | null>(null);

export function AppNavigationProvider({ navigation, children }: { navigation: AppNavigation; children: ReactNode }) {
  return <NavigationContext.Provider value={navigation}>{children}</NavigationContext.Provider>;
}

export function useAppNavigation() {
  const navigation = useContext(NavigationContext);
  if (!navigation) throw new Error("页面缺少导航配置");
  return navigation;
}

export function AppLink(props: AppLinkProps) {
  const { Link } = useAppNavigation();
  return <Link {...props} />;
}
