import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AccountScreen } from "@/app/login/account-form";
import { WebNavigationProvider } from "@/app/web-navigation";
import { getPageSession } from "@/lib/auth";
import { homePath } from "@/lib/login-path";

export const metadata: Metadata = { title: "注册账号" };

export default async function RegisterPage() {
  const { registrationUnavailable, session } = await getPageSession();
  if (session) redirect(homePath);

  return (
    <WebNavigationProvider>
      <AccountScreen mode="register" next={homePath} registrationUnavailable={registrationUnavailable} />
    </WebNavigationProvider>
  );
}
