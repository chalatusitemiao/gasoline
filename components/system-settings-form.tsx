"use client";

import { AimOutlined } from "@ant-design/icons";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Alert, App, Button, Card, Checkbox, Form, InputNumber, Select, Skeleton } from "antd";
import { useState } from "react";
import { useAppNavigation } from "@/components/app-navigation";
import { apiFetch, jsonRequest } from "@/lib/api-client";
import styles from "./system-settings.module.css";

type CompanySettings = {
  companyName: string;
  timeZone: string;
  baselineSamples: number;
  anomalyMultiplier: number;
  revision: string;
};
type SettingsValues = { timeZone: string; baselineSamples: number; anomalyMultiplier: number; recalculate?: boolean };

const defaultTimeZone = "Asia/Shanghai";
const timeZoneNames: Record<string, string> = {
  [defaultTimeZone]: "上海",
  "Asia/Hong_Kong": "香港", "Asia/Taipei": "台北", "Asia/Singapore": "新加坡",
  "Asia/Tokyo": "东京", "Asia/Seoul": "首尔", "Europe/London": "伦敦",
  "America/New_York": "纽约", "America/Los_Angeles": "洛杉矶", UTC: "协调世界时",
};

function getTimeZoneOptions(zones: string[], selected?: string) {
  const values = new Set([...Object.keys(timeZoneNames), ...zones]);
  if (selected) values.add(selected);
  return Array.from(values).map((value) => ({ value, label: timeZoneNames[value] ? `${timeZoneNames[value]} (${value})` : value }));
}

export function CompanySettingsPanel() {
  const queryClient = useQueryClient();
  const { refresh, companyId } = useAppNavigation();
  const settingsKey = ["system-settings", companyId] as const;
  const settings = useQuery({ queryKey: settingsKey, queryFn: ({ signal }) => apiFetch<CompanySettings>("/api/settings", { signal }) });
  if (!settings.data) {
    if (settings.isError) return <Alert type="error" showIcon message={settings.error.message} action={<Button onClick={() => void settings.refetch()} loading={settings.isFetching}>重试</Button>} />;
    return <Card><Skeleton active paragraph={{ rows: 5 }} /></Card>;
  }
  return <CompanySettingsForm settings={settings.data} onSaved={(updated) => {
    queryClient.setQueryData(settingsKey, updated);
    void queryClient.invalidateQueries({ queryKey: ["fuel"] });
    refresh();
  }} />;
}

function CompanySettingsForm({ settings, onSaved }: { settings: CompanySettings; onSaved: (settings: CompanySettings) => void }) {
  const [form] = Form.useForm<SettingsValues>();
  const { message } = App.useApp();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [availableTimeZones, setAvailableTimeZones] = useState<string[]>([]);
  const selectedTimeZone = Form.useWatch("timeZone", form) ?? settings.timeZone;
  const zones = getTimeZoneOptions(availableTimeZones, selectedTimeZone);

  async function save(values: SettingsValues) {
    setError("");
    setSaving(true);
    try {
      const payload = {
        timeZone: values.timeZone,
        baselineSamples: values.baselineSamples,
        anomalyMultiplier: values.anomalyMultiplier,
        revision: settings.revision,
        recalculate: Boolean(values.recalculate),
      };
      const updated = await apiFetch<CompanySettings>("/api/settings", jsonRequest("PUT", payload));
      form.setFieldsValue({ ...updated, recalculate: false });
      onSaved(updated);
      message.success(values.recalculate ? "本公司配置已保存，历史记录已重新计算" : "本公司配置已保存");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "保存失败，请重试。");
    } finally {
      setSaving(false);
    }
  }

  return <Form<SettingsValues> className={styles.form} form={form} layout="vertical" autoComplete="off" disabled={saving} initialValues={{ ...settings, recalculate: false }} onFinish={save}>
    <Card title={`${settings.companyName} · 业务参数`}>
      <Form.Item label="业务时区" htmlFor="fuel-business-time-zone" extra="用于加油日期校验、报表月份和删除日志保留期。修改时区不会改写已有记录的业务日期。">
        <div className={styles.timeZoneField}>
          <Form.Item name="timeZone" noStyle rules={[{ required: true, message: "请选择业务时区" }]}><Select id="fuel-business-time-zone" showSearch optionFilterProp="label" options={zones} placeholder="搜索地区或时区名称" onOpenChange={(open) => { if (open && !availableTimeZones.length && typeof Intl.supportedValuesOf === "function") setAvailableTimeZones(Intl.supportedValuesOf("timeZone")); }} /></Form.Item>
          <Button icon={<AimOutlined />} onClick={() => { const detected = Intl.DateTimeFormat().resolvedOptions().timeZone; if (detected) form.setFieldValue("timeZone", detected); }}>使用设备时区</Button>
        </div>
      </Form.Item>
      <div className={styles.fields}>
        <Form.Item name="baselineSamples" label="油耗基线样本数" rules={[{ required: true, type: "integer", min: 2, max: 100, message: "请输入 2–100 的整数" }]}><InputNumber className={styles.number} min={2} max={100} step={1} /></Form.Item>
        <Form.Item name="anomalyMultiplier" label="油耗异常倍数" rules={[{ required: true, type: "number", min: 1, max: 100, message: "请输入 1–100 的数值" }]}><InputNumber className={styles.number} min={1} max={100} step={0.1} /></Form.Item>
      </div>
      <Form.Item name="recalculate" valuePropName="checked" extra="勾选后按本次参数重新计算本公司所有车辆的历史油耗和异常。未勾选时，在车辆下次新增、修改、删除或导入记录时重算。"><Checkbox>保存时重算本公司历史记录</Checkbox></Form.Item>
    </Card>
    {error && <Alert type="error" showIcon message={error} />}
    <div className={styles.actions}><Button type="primary" htmlType="submit" loading={saving}>保存配置</Button></div>
  </Form>;
}
