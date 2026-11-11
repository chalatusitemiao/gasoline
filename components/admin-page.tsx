"use client";

import { PageContainer } from "@ant-design/pro-components";
import type { ReactNode } from "react";
import styles from "./admin-page.module.css";

export function AdminPage({
  title,
  actions,
  className,
  children,
}: {
  title: string;
  actions?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  return (
    <PageContainer
      title={<span role="heading" aria-level={1}>{title}</span>}
      extra={actions != null && <div className={styles.actions}>{actions}</div>}
    >
      {className ? <div className={className}>{children}</div> : children}
    </PageContainer>
  );
}
