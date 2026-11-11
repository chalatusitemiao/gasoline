import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { safeReturnTo } from "@/lib/login-path";
import { LoginForm } from "./login-form";
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
  const session = await getSession();

  if (session) {
    redirect(next);
  }

  return (
    <main className={styles.screen} aria-labelledby="login-title">
      <div className={styles.content}>
        <LoginForm next={next} />
      </div>
    </main>
  );
}
