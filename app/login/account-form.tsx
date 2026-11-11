"use client";

import { KeyOutlined, LockOutlined, UserOutlined } from "@ant-design/icons";
import { LoginForm as ProLoginForm, ProFormText } from "@ant-design/pro-components";
import { Alert } from "antd";
import Link from "next/link";
import { useState } from "react";
import { BrandMark } from "@/components/brand-mark";
import { ApiClientError, apiFetch, jsonRequest } from "@/lib/api-client";
import { loginErrorMessage, loginSchema } from "@/lib/login-contract";
import styles from "./login.module.css";

type AccountFields = { username: string; password: string; registrationKey?: string };
type AccountFormProps =
  | { mode: "login"; next: string; registrationEnabled: boolean }
  | { mode: "register"; next: string };

export function AccountForm(props: AccountFormProps) {
  const [errorMessage, setErrorMessage] = useState("");
  const isRegistration = props.mode === "register";
  const heading = isRegistration ? "注册账号" : "账号密码登录";
  const alternateLink = isRegistration ? (
    <Link className={styles.accountLink} href="/login">返回登录</Link>
  ) : props.registrationEnabled ? (
    <Link className={styles.accountLink} href="/register">注册账号</Link>
  ) : null;

  async function submit(values: AccountFields) {
    setErrorMessage("");
    const credentials = loginSchema.safeParse(values);
    if (!credentials.success) {
      setErrorMessage(isRegistration ? "请输入有效的账号和密码" : loginErrorMessage);
      return;
    }

    try {
      if (isRegistration) {
        await apiFetch("/api/register", jsonRequest("POST", {
          ...credentials.data,
          registrationKey: values.registrationKey,
        }));
      } else {
        await apiFetch("/api/login", jsonRequest("POST", credentials.data));
      }
      window.location.replace(props.next);
    } catch (error) {
      const fallback = isRegistration ? "注册失败，请稍后重试" : loginErrorMessage;
      setErrorMessage(error instanceof ApiClientError ? error.message : fallback);
    }
  }

  return (
    <ProLoginForm<AccountFields>
      logo={<BrandMark size={44} />}
      title={<span id="account-title" role="heading" aria-level={1}>油量监控</span>}
      subTitle="车队用油管理后台"
      contentStyle={{ minWidth: "min(280px, 100%)", maxWidth: "min(75vw, 100%)" }}
      otherStyle={{ textAlign: "center" }}
      actions={alternateLink}
      layout="vertical"
      autoComplete="on"
      onFinish={submit}
      submitter={{
        resetButtonProps: false,
        searchConfig: { submitText: isRegistration ? "注册" : "登录" },
      }}
    >
      <h2 className={styles.modeHeading}><span>{heading}</span></h2>
      {errorMessage && <Alert className={styles.error} type="error" message={errorMessage} showIcon />}
      <ProFormText
        name="username"
        placeholder="输入账号"
        fieldProps={{
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
          "aria-label": "密码",
          autoComplete: isRegistration ? "new-password" : "current-password",
          maxLength: 1024,
          size: "large",
          prefix: <LockOutlined />,
        }}
      />
      {isRegistration && (
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
      )}
    </ProLoginForm>
  );
}
