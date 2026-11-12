import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getPageSession } from "@/lib/auth";
import { safeReturnTo } from "@/lib/login-path";
import { WebNavigationProvider } from "@/app/web-navigation";
import { AccountScreen } from "./account-form";

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
    <WebNavigationProvider>
      <AccountScreen mode="login" next={next} />
    </WebNavigationProvider>
  );
}
