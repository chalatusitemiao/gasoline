import { lazy, Suspense, useCallback, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { App, Button, Card, Form, Input, Result, Space, Spin } from "antd";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AppProviders, AppQueryProvider } from "@/app/providers";
import AdminLoading from "@/app/(admin)/loading";
import { AppNavigationProvider } from "@/components/app-navigation";
import { BrandMark } from "@/components/brand-mark";
import { ApiClientError } from "@/lib/api-client";
import { homePath, loginPath, safeReturnTo } from "@/lib/login-path";
import { disconnectServer, loadSession, serverStorageKey, sessionExpiredEvent, type DesktopSession } from "./api";
import { DesktopLink, desktopLocation, replaceDesktopLocation, useDesktopLocation } from "./navigation";
import { DesktopPage } from "./pages";
import "./global.css";
import styles from "./main.module.css";

const AccountScreen = lazy(() => import("@/app/login/account-form").then(({ AccountScreen }) => ({ default: AccountScreen })));
const AdminShell = lazy(() => import("@/app/(admin)/admin-shell").then(({ AdminShell }) => ({ default: AdminShell })));
const sessionKey = ["desktop-session"];

function ServerSetup({ onConnect }: { onConnect: (server: string) => void }) {
  return (
    <main className={styles.setup}>
      <Card className={styles.serverCard}>
        <Space size="middle" className={styles.serverTitle}>
          <BrandMark size={36} />
          <h1>连接车辆监控服务器</h1>
        </Space>
        <Form<{ server: string }> layout="vertical" onFinish={({ server }) => onConnect(server.trim())}>
          <Form.Item label="网页版地址" name="server" rules={[{ required: true, whitespace: true, message: "请输入网页版地址" }]}>
            <Input type="url" placeholder="https://example.com" autoComplete="url" />
          </Form.Item>
          <Button type="primary" htmlType="submit" block>连接</Button>
        </Form>
      </Card>
    </main>
  );
}

function Connecting() {
  return <main className={styles.setup} role="status"><Spin size="large" />正在连接车辆监控服务器…</main>;
}

function ConnectedDesktop({ server, onChangeServer }: { server: string; onChangeServer: () => Promise<void> }) {
  const { message } = App.useApp();
  const [changingServer, setChangingServer] = useState(false);
  const [switchError, setSwitchError] = useState("");
  const queryClient = useQueryClient();
  const location = useDesktopLocation();
  const { pathname: urlPath, search } = new URL(location, window.location.href);
  const pathname = urlPath === "/index.html" ? "/" : urlPath.replace(/\/$/, "") || "/";
  const session = useQuery({
    queryKey: sessionKey,
    queryFn: ({ signal }) => loadSession(server, signal),
    staleTime: Infinity,
    retry: false,
  });
  const account = session.data;
  const signedIn = Boolean(account?.name && account.timeZone);
  const accountPage = pathname === "/login" || pathname === "/register";
  const next = pathname === "/login" ? safeReturnTo(new URLSearchParams(search).get("next")) : homePath;
  const loginNext = pathname === "/" ? homePath : safeReturnTo(location);

  const endSession = useCallback((destination = "/login") => {
    void queryClient.cancelQueries({ queryKey: sessionKey }, { revert: false });
    queryClient.setQueryData<DesktopSession>(sessionKey, (previous) => ({
      name: null,
      timeZone: null,
      registrationUnavailable: previous?.registrationUnavailable ?? null,
    }));
    replaceDesktopLocation(destination);
  }, [queryClient]);

  useEffect(() => {
    const handleSessionExpired = () => {
      const currentPath = window.location.pathname.replace(/\/$/, "");
      if (currentPath !== "/login" && currentPath !== "/register") endSession(loginPath(desktopLocation()));
    };
    window.addEventListener(sessionExpiredEvent, handleSessionExpired);
    return () => window.removeEventListener(sessionExpiredEvent, handleSessionExpired);
  }, [endSession]);

  useEffect(() => {
    if (!account) return;
    if (!signedIn && !accountPage) replaceDesktopLocation(loginPath(loginNext));
    else if (signedIn && (accountPage || pathname === "/")) replaceDesktopLocation(next);
  }, [account, accountPage, loginNext, next, pathname, signedIn]);

  async function changeServer() {
    setChangingServer(true);
    setSwitchError("");
    try {
      await onChangeServer();
    } catch {
      setSwitchError("无法断开当前连接，请重试。");
      setChangingServer(false);
    }
  }

  const changeServerButton = <Button loading={changingServer} onClick={() => void changeServer()}>更换服务器</Button>;
  if (!account) {
    if (session.isPending) return <Connecting />;
    const error = session.error;
    return (
      <main className={styles.setup}>
        <Result
          status="error"
          title="连接服务器失败"
          subTitle={switchError || (error instanceof Error ? error.message : typeof error === "string" ? error : "请确认网页版地址并重试。")}
          extra={<Space><Button type="primary" loading={session.isFetching} onClick={() => void session.refetch()}>重试</Button>{changeServerButton}</Space>}
        />
      </main>
    );
  }

  async function completeAccount() {
    const { data } = await session.refetch({ throwOnError: true });
    if (data?.name && data.timeZone) return;
    if (pathname === "/register") {
      void message.success("账号已注册，请登录。");
      return "/login";
    }
    throw new ApiClientError("未能建立登录会话，请重试。", 0);
  }

  return (
    <AppNavigationProvider navigation={{
      pathname,
      Link: DesktopLink,
      replace: replaceDesktopLocation,
      refresh: () => { void session.refetch(); },
      onSessionEnded: () => endSession(),
    }}>
      {!account.name || !account.timeZone ? (
        <>
          <div className={styles.changeServer}>{changeServerButton}{switchError && <p role="alert">{switchError}</p>}</div>
          <Suspense fallback={<Connecting />}>
            {pathname === "/register" ? (
              <AccountScreen
                key="register"
                mode="register"
                next={homePath}
                registrationUnavailable={account.registrationUnavailable}
                onAccountAccepted={completeAccount}
              />
            ) : (
              <AccountScreen
                key="login"
                mode="login"
                next={accountPage ? next : loginNext}
                rememberPassword={false}
                onAccountAccepted={completeAccount}
              />
            )}
          </Suspense>
        </>
      ) : accountPage || pathname === "/" ? <AdminLoading /> : (
        <AppQueryProvider key={account.name}>
          <Suspense fallback={<AdminLoading />}>
            <AdminShell name={account.name}>
              <Suspense fallback={<AdminLoading />}>
                <DesktopPage pathname={pathname} search={search} timeZone={account.timeZone} />
              </Suspense>
            </AdminShell>
          </Suspense>
        </AppQueryProvider>
      )}
    </AppNavigationProvider>
  );
}

function DesktopApp() {
  const [server, setServer] = useState(() => localStorage.getItem(serverStorageKey) || import.meta.env.VITE_GASOLINE_API_ORIGIN?.trim() || "");

  return (
    <AppProviders>
      {server ? (
        <AppQueryProvider key={server}>
          <ConnectedDesktop server={server} onChangeServer={async () => {
            await disconnectServer();
            setServer("");
          }} />
        </AppQueryProvider>
      ) : <ServerSetup onConnect={setServer} />}
    </AppProviders>
  );
}

createRoot(document.getElementById("root")!).render(<DesktopApp />);
