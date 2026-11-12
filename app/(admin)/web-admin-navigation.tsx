"use client";

import Link, { useLinkStatus } from "next/link";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { WebNavigationProvider } from "@/app/web-navigation";
import type { AppLinkProps } from "@/components/app-navigation";
import styles from "./admin.module.css";

function NavigationIndicator() {
  const { pending } = useLinkStatus();
  return pending ? <span className={styles.navigationIndicator} aria-hidden="true" /> : null;
}

function WebMenuLink({ children, ...props }: AppLinkProps) {
  const [hoverIntent, setHoverIntent] = useState(false);
  const [focusIntent, setFocusIntent] = useState(false);
  const hoverTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const current = props["aria-current"] === "page";
  // 可见时只预取动态路由的占位，用户有访问意图时才预取完整页面。
  const prefetch = current ? false : hoverIntent || focusIntent ? true : null;

  useEffect(() => () => clearTimeout(hoverTimer.current), []);

  return (
    <Link
      {...props}
      prefetch={prefetch}
      onPointerEnter={({ pointerType }) => {
        if (pointerType === "mouse" && !current) {
          hoverTimer.current = setTimeout(() => setHoverIntent(true), 120);
        }
      }}
      onPointerLeave={() => {
        clearTimeout(hoverTimer.current);
        setHoverIntent(false);
      }}
      onFocus={({ currentTarget }) => setFocusIntent(currentTarget.matches(":focus-visible"))}
      onBlur={() => setFocusIntent(false)}
    >
      {children}
      <NavigationIndicator />
    </Link>
  );
}

export function WebAdminNavigation({ children }: { children: ReactNode }) {
  return <WebNavigationProvider MenuLink={WebMenuLink}>{children}</WebNavigationProvider>;
}
