"use client";

import { KeyOutlined, LockOutlined, UserOutlined } from "@ant-design/icons";
import { LoginForm as ProLoginForm, ProFormCheckbox, ProFormText } from "@ant-design/pro-components";
import { Alert, Spin } from "antd";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { BrandMark } from "@/components/brand-mark";
import { ApiClientError, apiFetch, jsonRequest } from "@/lib/api-client";
import { loginErrorMessage, loginSchema } from "@/lib/login-contract";
import styles from "./login.module.css";

type AccountFields = {
  username: string;
  password: string;
  registrationKey?: string;
  rememberPassword?: boolean;
};
type AccountFormProps =
  | { mode: "login"; next: string }
  | { mode: "register"; next: string; registrationUnavailable: string | null };

async function saveBrowserPassword(username: string, password: string) {
  const { PasswordCredential } = window as Window & {
    PasswordCredential?: new (data: { id: string; password: string }) => Credential;
  };

  if (typeof PasswordCredential !== "function" || !navigator.credentials?.store) return;

  try {
    await navigator.credentials.store(new PasswordCredential({ id: username, password }));
  } catch {
    // Password storage depends on browser settings and must not interrupt sign-in.
  }
}

export function AccountForm(props: AccountFormProps) {
  const router = useRouter();
  const formRef = useRef<{ nativeElement?: HTMLElement } | undefined>(undefined);
  const pendingRequest = useRef(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [phase, setPhase] = useState<"idle" | "submitting" | "accepted">("idle");
  const [navigating, startNavigation] = useTransition();
  const isRegistration = props.mode === "register";
  const registrationUnavailable = isRegistration ? props.registrationUnavailable : null;
  const submitting = phase === "submitting";
  const heading = isRegistration ? "注册账号" : "账号密码登录";
  const submitText = isRegistration ? "注册" : "登录";
  const submittingText = `正在${submitText}…`;
  const navigationText = isRegistration ? "注册成功，正在跳转…" : "登录成功，正在进入后台…";
  const error = errorMessage || (phase === "accepted" && !navigating ? "页面跳转未完成，请重试。" : "");

  async function submit(values: AccountFields) {
    if (pendingRequest.current || navigating) return;
    setErrorMessage("");
    setPhase("idle");

    // Autofill can change the inputs without updating the form library's values.
    const form = formRef.current?.nativeElement;
    const fields = form instanceof HTMLFormElement ? new FormData(form) : null;
    const credentials = loginSchema.safeParse({
      username: fields?.get("username") ?? values.username,
      password: fields?.get("password") ?? values.password,
    });
    if (!credentials.success) {
      setErrorMessage(isRegistration ? "请输入有效的账号和密码" : loginErrorMessage);
      return;
    }

    pendingRequest.current = true;
    setPhase("submitting");
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 30_000);

    try {
      const payload = isRegistration
        ? { ...credentials.data, registrationKey: values.registrationKey }
        : credentials.data;
      await apiFetch(isRegistration ? "/api/register" : "/api/login", {
        ...jsonRequest("POST", payload),
        signal: controller.signal,
      });

      if (!isRegistration && values.rememberPassword) {
        void saveBrowserPassword(credentials.data.username, credentials.data.password);
      }

      setPhase("accepted");
      startNavigation(() => router.replace(props.next));
    } catch (error) {
      setPhase("idle");
      if (controller.signal.aborted) {
        setErrorMessage("请求超时，请重试。");
      } else {
        setErrorMessage(error instanceof ApiClientError ? error.message : `${submitText}失败，请检查网络后重试。`);
      }
    } finally {
      window.clearTimeout(timeout);
      pendingRequest.current = false;
    }
  }

  return (
    <ProLoginForm<AccountFields>
      logo={<BrandMark size={44} />}
      title={<span id="account-title" role="heading" aria-level={1}>车辆监控</span>}
      subTitle="用油管理后台"
      contentStyle={{ minWidth: "min(280px, 100%)", maxWidth: "min(75vw, 100%)" }}
      otherStyle={{ textAlign: "center" }}
      actions={submitting || navigating ? null : (
        <Link className={styles.accountLink} href={isRegistration ? "/login" : "/register"}>
          {isRegistration ? "返回登录" : "注册账号"}
        </Link>
      )}
      formRef={formRef}
      name={isRegistration ? "registration" : "login"}
      method="post"
      layout="vertical"
      autoComplete="on"
      isKeyPressSubmit={false}
      disabled={submitting}
      onFinish={registrationUnavailable || navigating ? undefined : submit}
      submitter={registrationUnavailable || navigating ? false : {
        resetButtonProps: false,
        searchConfig: { submitText: submitting ? submittingText : submitText },
        submitButtonProps: { htmlType: "submit", preventDefault: true, loading: submitting, disabled: submitting },
      }}
    >
      <h2 className={styles.modeHeading}><span>{heading}</span></h2>
      <div className={navigating ? styles.navigationStatus : "sr-only"} role="status">
        {navigating && <span aria-hidden="true"><Spin size="small" /></span>}
        {navigating ? navigationText : submitting ? submittingText : ""}
      </div>
      {registrationUnavailable ? (
        <Alert type="info" message={registrationUnavailable} showIcon />
      ) : !navigating && (
        <>
          {error && <Alert className={styles.error} type="error" message={error} showIcon />}
          <ProFormText
            name="username"
            placeholder="输入账号"
            fieldProps={{
              name: "username",
              "aria-label": "账号",
              autoComplete: "username",
              maxLength: 128,
              size: "large",
              prefix: <UserOutlined />,
            }}
          />
          <ProFormText.Password
            name="password"
            placeholder="输入密码"
            fieldProps={{
              name: "password",
              "aria-label": "密码",
              autoComplete: isRegistration ? "new-password" : "current-password",
              maxLength: 1024,
              size: "large",
              prefix: <LockOutlined />,
            }}
          />
          {isRegistration ? (
            <ProFormText.Password
              name="registrationKey"
              placeholder="输入注册密钥"
              rules={[{ required: true, message: "请输入注册密钥" }]}
              fieldProps={{
                "aria-label": "注册密钥",
                autoComplete: "off",
                maxLength: 1024,
                size: "large",
                prefix: <KeyOutlined />,
              }}
            />
          ) : (
            <ProFormCheckbox name="rememberPassword">
              记住密码<span className={styles.rememberHint}>由浏览器保存</span>
            </ProFormCheckbox>
          )}
        </>
      )}
    </ProLoginForm>
  );
}
