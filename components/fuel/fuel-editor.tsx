"use client";

import { ProForm, ProFormDigit, ProFormSelect, ProFormText, ProFormTextArea } from "@ant-design/pro-components";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Alert, App, Button, Card, Empty, Form, Spin } from "antd";
import Decimal from "decimal.js";
import { apiFetch, jsonRequest } from "@/lib/api-client";
import {
  driverLabel,
  fuelRecordInputSchema,
  fuelRecordUpdateSchema,
  type FuelOptions,
  type FuelRecord,
  type FuelRecordDetail,
  type FuelType,
} from "@/lib/fuel";
import { FUEL_OPTIONS, FULL_TANK_NOTE, fuelText, moneyText, numberText, QueryError } from "./ui";
import styles from "./fuel-editor.module.css";

type Fields = {
  vehicleId?: string;
  driverId?: string;
  fuelType?: FuelType;
  date?: string;
  liters?: string | number;
  unitPrice?: string | number;
  odometer?: string | number;
  notes?: string;
  reason?: string;
};

type Recent = { items: FuelRecord[]; latest: FuelRecord | null };
const FuelDecimal = Decimal.clone({ precision: 40, rounding: Decimal.ROUND_HALF_UP });
const required = [{ required: true, message: "请填写或选择此项" }];
const numericInput = {
  stringMode: true,
  min: 0,
  inputMode: "decimal" as const,
  style: { width: "100%" },
};

function previewNumber(value: string | number | undefined) {
  if (value == null || value === "") return null;
  try {
    const number = new FuelDecimal(value);
    return number.isFinite() && number.gt(0) ? number : null;
  } catch {
    return null;
  }
}

export function FuelEditor({
  today,
  record,
  onSaved,
  onCancel,
}: {
  today: string;
  record?: FuelRecord;
  onSaved?: () => void;
  onCancel?: () => void;
}) {
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const [form] = Form.useForm<Fields>();
  const vehicleId = Form.useWatch("vehicleId", form);
  const date = Form.useWatch("date", form);
  const liters = previewNumber(Form.useWatch("liters", form));
  const price = previewNumber(Form.useWatch("unitPrice", form));
  const odometer = previewNumber(Form.useWatch("odometer", form));
  const options = useQuery({
    queryKey: ["fuel", "options"],
    queryFn: ({ signal }) => apiFetch<FuelOptions>("/api/fuel/options", { signal }),
  });
  const canLoadRecent = Boolean(vehicleId && date && date <= today);
  const recent = useQuery({
    queryKey: ["fuel", "recent", vehicleId, date, record?.id],
    enabled: canLoadRecent,
    queryFn: ({ signal }) => {
      const params = new URLSearchParams({ through: date ?? today });
      if (record) params.set("excludeId", record.id);
      return apiFetch<Recent>(`/api/fuel/vehicles/${encodeURIComponent(vehicleId ?? "")}/recent?${params}`, { signal });
    },
  });

  const previous = recent.data?.latest;
  const amount = liters && price
    ? record && liters.eq(record.liters) && price.eq(record.unitPrice)
      ? record.amount
      : liters.mul(price).toFixed(2)
    : null;
  const distance = odometer && previous ? odometer.minus(previous.odometer) : null;
  const consumption = liters && distance?.gt(0)
    ? liters.mul(100).div(distance).toFixed(6)
    : null;

  const save = useMutation({
    mutationFn: (values: Fields) => apiFetch<FuelRecord>(
      record ? `/api/fuel/records/${encodeURIComponent(record.id)}` : "/api/fuel/records",
      jsonRequest(record ? "PUT" : "POST", values),
    ),
  });

  async function submit(values: Fields) {
    const result = (record ? fuelRecordUpdateSchema : fuelRecordInputSchema).safeParse(values);
    if (!result.success) {
      const fields = result.error.issues
        .filter((issue) => issue.path.length > 0)
        .map((issue) => ({ name: issue.path[0] as keyof Fields, errors: [issue.message] }));
      form.setFields(fields);
      return false;
    }
    if (result.data.date > today) {
      form.setFields([{ name: "date", errors: ["加油日期不能晚于今天"] }]);
      return false;
    }

    try {
      const saved = await save.mutateAsync(result.data);
      if (record) {
        queryClient.setQueryData<FuelRecordDetail>(["fuel", "record", record.id], (detail) =>
          detail ? { ...detail, record: saved } : undefined,
        );
      }
      void queryClient.invalidateQueries({ queryKey: ["fuel"] });
      if (!record) form.resetFields();
      message.success(record ? "加油记录已修改。" : "加油记录已保存。");
      onSaved?.();
      return true;
    } catch {
      return false;
    }
  }

  const initialValues = record
    ? {
        vehicleId: record.vehicleId,
        driverId: record.driverId,
        date: record.date,
        fuelType: record.fuelType,
        liters: record.liters,
        unitPrice: record.unitPrice,
        odometer: record.odometer,
        notes: record.notes,
      }
    : { date: today };

  return (
    <div className={record ? styles.editStack : styles.editorGrid}>
      <Card className={styles.card}>
        {options.error && <QueryError error={options.error} retry={() => { void options.refetch(); }} />}
        {save.error && <QueryError error={save.error} />}
        <ProForm<Fields>
          form={form}
          initialValues={initialValues}
          disabled={save.isPending}
          onValuesChange={(changed: Partial<Fields>) => {
            if ("vehicleId" in changed) {
              const selected = options.data?.vehicles.find((vehicle) => vehicle.id === changed.vehicleId);
              form.setFieldValue("fuelType", selected?.fuelType);
            }
          }}
          onFinish={submit}
          submitter={{
            resetButtonProps: false,
            searchConfig: { submitText: record ? "保存修改" : "保存加油记录" },
            submitButtonProps: { size: "large", disabled: options.isPending },
            render: (_props, nodes) => [
              onCancel && <Button key="cancel" size="large" onClick={onCancel} disabled={save.isPending}>取消</Button>,
              ...nodes,
            ],
          }}
        >
          <div className={styles.fields}>
            <ProFormSelect
              name="vehicleId"
              label="车辆"
              placeholder="搜索车牌"
              rules={required}
              showSearch
              options={options.data?.vehicles.map((vehicle) => ({ label: vehicle.plate, value: vehicle.id }))}
              fieldProps={{ loading: options.isPending, optionFilterProp: "label" }}
            />
            <ProFormSelect
              name="driverId"
              label="司机"
              placeholder="搜索姓名或档案编号"
              rules={required}
              showSearch
              options={options.data?.drivers
                .filter((driver) => driver.isActive || driver.id === record?.driverId)
                .map((driver) => ({
                  label: `${driverLabel(driver.name, driver.id)}${driver.isActive ? "" : "（停用）"}`,
                  title: driver.id,
                  value: driver.id,
                }))}
              fieldProps={{ loading: options.isPending, optionFilterProp: "label" }}
            />
            <ProFormText name="date" label="加油日期" rules={required} fieldProps={{ type: "date", max: today }} />
            <ProFormSelect name="fuelType" label="油品" rules={required} options={FUEL_OPTIONS} />
            <ProFormDigit name="liters" label="加油量（L）" rules={required} fieldProps={numericInput} />
            <ProFormDigit name="unitPrice" label="单价（元/L）" rules={required} fieldProps={numericInput} />
            <ProFormDigit
              name="odometer"
              label="里程表读数（km）"
              rules={required}
              fieldProps={numericInput}
              extra={vehicleId ? `上次里程 ${numberText(previous?.odometer)} km` : undefined}
            />
          </div>
          <ProFormTextArea name="notes" label="备注" fieldProps={{ maxLength: 500, autoSize: { minRows: 2, maxRows: 5 } }} />
          {record && (
            <ProFormTextArea
              name="reason"
              label="修改原因"
              placeholder="说明本次修改原因"
              rules={required}
              fieldProps={{ maxLength: 500, autoSize: { minRows: 2, maxRows: 5 } }}
            />
          )}
          <dl className={styles.preview} aria-live="polite">
            <div><dt>单价</dt><dd>{numberText(price?.toFixed(6), 6)} <small>元/L</small></dd></div>
            <div className={styles.previewAmount}><dt>加油金额</dt><dd>{moneyText(amount)} <small>元</small></dd></div>
            <div><dt>区间油耗</dt><dd>{numberText(consumption)} <small>L/100km</small></dd></div>
          </dl>
          {distance?.lte(0) && (
            <Alert type="warning" showIcon message="里程表读数未高于上次记录，请核对。保存后会标记异常，本次读数仍会用于下一笔区间计算。" className={styles.warning} />
          )}
          <p className={styles.note}>{FULL_TANK_NOTE}</p>
        </ProForm>
      </Card>

      <Card title="最近加油" className={styles.card}>
        {recent.error && <QueryError error={recent.error} retry={() => { void recent.refetch(); }} />}
        {recent.isFetching ? <Spin /> : recent.data?.items.length ? (
          <ul className={styles.recent}>
            {recent.data.items.map((entry) => (
              <li key={entry.id}>
                <time dateTime={entry.date}>{entry.date}</time>
                <span>{fuelText(entry.fuelType)} · {numberText(entry.liters, 3)} L</span>
                <strong>{numberText(entry.odometer)} km</strong>
              </li>
            ))}
          </ul>
        ) : !recent.error && (
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description={vehicleId ? "该日期前暂无加油记录" : "选择车辆后查看最近 3 条加油记录"}
          />
        )}
      </Card>
    </div>
  );
}
