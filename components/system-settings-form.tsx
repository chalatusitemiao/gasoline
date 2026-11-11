"use client";

import { AimOutlined } from "@ant-design/icons";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Alert, App, Button, Card, Form, Input, InputNumber, Select, Skeleton } from "antd";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { apiFetch, jsonRequest } from "@/lib/api-client";
import styles from "./system-settings.module.css";

type Settings = {
  authUrl: string;
  username: string;
  timeZone: string;
  baselineSamples: number;
  anomalyMultiplier: number;
};

type SettingsValues = Settings & {
  password?: string;
};

type SettingsResult = Settings & { requireLogin?: boolean };

const settingsKey = ["system-settings"] as const;
const defaultTimeZone = "Asia/Shanghai";
const timeZoneNames: Record<string, string> = {
  [defaultTimeZone]: "上海",
  "Asia/Hong_Kong": "香港",
  "Asia/Taipei": "台北",
  "Asia/Singapore": "新加坡",
  "Asia/Tokyo": "东京",
  "Asia/Seoul": "首尔",
  "Europe/London": "伦敦",
  "America/New_York": "纽约",
  "America/Los_Angeles": "洛杉矶",
  UTC: "协调世界时",
};

function getTimeZoneOptions(zones: string[], selected?: string) {
  const values = new Set([...Object.keys(timeZoneNames), ...zones]);
  if (selected) values.add(selected);
  return Array.from(values).map((value) => ({
    value,
    label: timeZoneNames[value] ? `${timeZoneNames[value]} (${value})` : value,
  }));
}

export function SystemSettingsPanel() {
  const queryClient = useQueryClient();
  const router = useRouter();
  const settings = useQuery({
    queryKey: settingsKey,
    queryFn: ({ signal }) => apiFetch<Settings>("/api/settings", { signal }),
  });

  if (!settings.data) {
    if (settings.isError) {
      return <Alert
        type="error"
        showIcon
        message={settings.error.message}
        action={<Button onClick={() => void settings.refetch()} loading={settings.isFetching}>重试</Button>}
      />;
    }

    return <Card><Skeleton active paragraph={{ rows: 5 }} /></Card>;
  }

  return <SystemSettingsForm settings={settings.data} onSaved={(updated) => {
    queryClient.setQueryData(settingsKey, updated);
    void queryClient.invalidateQueries({ queryKey: ["fuel"] });
    router.refresh();
  }} />;
}

function SystemSettingsForm({
  settings,
  onSaved,
}: {
  settings: Settings;
  onSaved: (settings: Settings) => void;
}) {
  const [form] = Form.useForm<SettingsValues>();
  const { message } = App.useApp();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [availableTimeZones, setAvailableTimeZones] = useState<string[]>([]);
  const selectedTimeZone = Form.useWatch("timeZone", form) ?? settings.timeZone;
  const zones = getTimeZoneOptions(availableTimeZones, selectedTimeZone);

  async function goToLogin(authUrl: string) {
    const login = new URL("/login", authUrl || window.location.origin);
    if (login.origin !== window.location.origin) {
      await message.success(`系统配置已保存。请在 ${login.origin} 登录。`);
    }
    window.location.replace(login.href);
  }

  async function save(values: SettingsValues) {
    setError("");
    setSaving(true);

    try {
      const payload = {
        ...values,
        authUrl: values.authUrl?.trim() ?? "",
        password: values.password || undefined,
      };

      const updated = await apiFetch<SettingsResult>("/api/settings", jsonRequest("PUT", payload));
      if (updated.requireLogin) {
        await goToLogin(updated.authUrl);
        return;
      }

      form.setFieldsValue({
        authUrl: updated.authUrl,
        username: updated.username,
        timeZone: updated.timeZone,
        baselineSamples: updated.baselineSamples,
        anomalyMultiplier: updated.anomalyMultiplier,
        password: "",
      });
      onSaved(updated);
      message.success("系统配置已保存");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "保存失败，请重试。");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Form<SettingsValues>
      className={styles.form}
      form={form}
      layout="vertical"
      autoComplete="off"
      disabled={saving}
      initialValues={settings}
      onFinish={save}
    >
      <Card title="站点配置">
        <Form.Item
          name="authUrl"
          label="站点地址"
          extra="留空时自动使用访问地址。"
          rules={[{
            validator: async (_, value: string | undefined) => {
              if (!value?.trim()) return;
              try {
                const url = new URL(value.trim());
                if (url.protocol === "https:" || url.protocol === "http:") return;
              } catch {
                throw new Error("请输入有效的 HTTP 或 HTTPS 地址");
              }
              throw new Error("请输入有效的 HTTP 或 HTTPS 地址");
            },
          }]}
        >
          <Input placeholder="例如 https://fuel.example.com" />
        </Form.Item>
      </Card>

      <Card title="后台账号">
        <div className={styles.fields}>
          <Form.Item
            name="username"
            label="用户名"
            rules={[{ required: true, whitespace: true, message: "请输入用户名" }]}
          >
            <Input maxLength={128} autoComplete="username" />
          </Form.Item>
          <Form.Item
            name="password"
            label="新密码"
          >
            <Input.Password maxLength={1024} autoComplete="new-password" placeholder="留空保留当前密码" />
          </Form.Item>
        </div>
      </Card>

      <Card title="业务参数">
        <Form.Item
          label="业务时区"
          htmlFor="fuel-business-time-zone"
          extra="用于加油日期校验、报表月份和删除日志保留期。"
        >
          <div className={styles.timeZoneField}>
            <Form.Item name="timeZone" noStyle rules={[{ required: true, message: "请选择业务时区" }]}>
              <Select
                id="fuel-business-time-zone"
                showSearch
                optionFilterProp="label"
                options={zones}
                placeholder="搜索地区或时区名称"
                onOpenChange={(open) => {
                  if (open && !availableTimeZones.length && typeof Intl.supportedValuesOf === "function") {
                    setAvailableTimeZones(Intl.supportedValuesOf("timeZone"));
                  }
                }}
              />
            </Form.Item>
            <Button
              icon={<AimOutlined />}
              onClick={() => {
                const detected = Intl.DateTimeFormat().resolvedOptions().timeZone;
                if (detected) form.setFieldValue("timeZone", detected);
              }}
            >
              使用设备时区
            </Button>
          </div>
        </Form.Item>
        <div className={styles.fields}>
          <Form.Item
            name="baselineSamples"
            label="油耗基线样本数"
            rules={[{ required: true, type: "integer", min: 2, max: 100, message: "请输入 2–100 的整数" }]}
          >
            <InputNumber className={styles.number} min={2} max={100} step={1} />
          </Form.Item>
          <Form.Item
            name="anomalyMultiplier"
            label="油耗异常倍数"
            rules={[{ required: true, type: "number", min: 1, max: 100, message: "请输入 1–100 的数值" }]}
          >
            <InputNumber className={styles.number} min={1} max={100} step={0.1} />
          </Form.Item>
        </div>
      </Card>

      {error && <Alert type="error" showIcon message={error} />}
      <div className={styles.actions}>
        <Button type="primary" htmlType="submit" loading={saving}>保存配置</Button>
      </div>
    </Form>
  );
}
