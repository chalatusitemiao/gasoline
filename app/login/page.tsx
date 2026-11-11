import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getPageSession } from "@/lib/auth";
import { safeReturnTo } from "@/lib/login-path";
import { AccountForm } from "./account-form";
import styles from "./login.module.css";

export const metadata: Metadata = {
  title: "登录",
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string | string[] }>;
}) {
  const next = safeReturnTo((await searchParams).next);
  const { session } = await getPageSession();

  if (session) {
    redirect(next);
  }

  return (
    <main className={styles.screen} aria-labelledby="account-title">
      <div className={styles.content}>
        <AccountForm mode="login" next={next} />
      </div>
    </main>
  );
}
