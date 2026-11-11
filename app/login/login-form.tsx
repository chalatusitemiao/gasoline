"use client";

import { LockOutlined, UserOutlined } from "@ant-design/icons";
import { LoginForm as ProLoginForm, ProFormText } from "@ant-design/pro-components";
import { Alert } from "antd";
import { useState } from "react";
import { BrandMark } from "@/components/brand-mark";
import { apiFetch, jsonRequest } from "@/lib/api-client";
import { loginErrorMessage, loginSchema } from "@/lib/login-contract";
import styles from "./login.module.css";

type Credentials = { username: string; password: string };

export function LoginForm({ next }: { next: string }) {
  const [errorMessage, setErrorMessage] = useState("");

  async function submit(values: Credentials) {
    setErrorMessage("");
    const credentials = loginSchema.safeParse(values);
    if (!credentials.success) {
      setErrorMessage(loginErrorMessage);
      return;
    }

    try {
      await apiFetch("/api/login", jsonRequest("POST", credentials.data));
      window.location.replace(next);
    } catch {
      setErrorMessage(loginErrorMessage);
    }
  }

  return (
    <ProLoginForm<Credentials>
      logo={<BrandMark size={44} />}
      title={<span id="login-title" role="heading" aria-level={1}>油量监控</span>}
      subTitle="车队用油管理后台"
      contentStyle={{ minWidth: "min(280px, 100%)", maxWidth: "min(75vw, 100%)" }}
      layout="vertical"
      autoComplete="on"
      onFinish={submit}
      submitter={{
        resetButtonProps: false,
        searchConfig: { submitText: "登录" },
      }}
    >
      <h2 className={styles.modeHeading}><span>账号密码登录</span></h2>
      {errorMessage && <Alert className={styles.error} type="error" message={errorMessage} showIcon />}
      <ProFormText
        name="username"
        placeholder="输入账号"
        fieldProps={{
          "aria-label": "账号",
          autoComplete: "username",
          size: "large",
          prefix: <UserOutlined />,
        }}
      />
      <ProFormText.Password
        name="password"
        placeholder="输入密码"
        fieldProps={{
          "aria-label": "密码",
          autoComplete: "current-password",
          size: "large",
          prefix: <LockOutlined />,
        }}
      />
    </ProLoginForm>
  );
}
