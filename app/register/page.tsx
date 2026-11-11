import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AccountForm } from "@/app/login/account-form";
import styles from "@/app/login/login.module.css";
import { getPageSession } from "@/lib/auth";
import { homePath } from "@/lib/login-path";

export const metadata: Metadata = { title: "注册账号" };

export default async function RegisterPage() {
  const { registrationEnabled, session } = await getPageSession();
  if (session) redirect(homePath);
  if (!registrationEnabled) redirect("/login");

  return (
    <main className={styles.screen} aria-labelledby="account-title">
      <div className={styles.content}>
        <AccountForm mode="register" next={homePath} />
      </div>
    </main>
  );
}
