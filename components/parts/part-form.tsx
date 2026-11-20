"use client";

import { SaveOutlined } from "@ant-design/icons";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { App, Button, Card, Form, Input, InputNumber, Select, Space } from "antd";
import Decimal from "decimal.js";
import { useAppNavigation } from "@/components/app-navigation";
import { DateInput } from "@/components/date-input";
import { moneyText, QueryError } from "@/components/fuel/ui";
import { apiFetch, jsonRequest } from "@/lib/api-client";
import {
  partQuantitySchema, partRecordInputSchema, partRecordUpdateSchema, partUnitPriceSchema,
  type PartPhotoInput, type PartRecord, type PartRecordDetail, type PartRecordInput, type PartRecordUpdate,
} from "@/lib/parts";
import { usePartOptions } from "./part-options";
import { PartPhotoField } from "./part-photo-field";
import styles from "./parts.module.css";

type PartFields = {
  vehicleId?: string;
  projectId?: string | null;
  date?: string;
  name?: string;
  quantity?: string | null;
  unitPrice?: string | null;
  purchaseArea?: string;
  photos?: PartPhotoInput[];
  reason?: string;
};

const Money = Decimal.clone({ precision: 40, rounding: Decimal.ROUND_HALF_UP });
const required = [{ required: true, message: "请填写或选择此项" }];

function previewAmount(quantity: string | null | undefined, unitPrice: string | null | undefined) {
  const count = partQuantitySchema.safeParse(quantity);
  const price = partUnitPriceSchema.safeParse(unitPrice);
  return count.success && price.success ? new Money(count.data).mul(price.data).toFixed(2) : null;
}

export function PartForm({
  today, record, onSaved, onCancel,
}: {
  today: string;
  record?: PartRecord;
  onSaved?: () => void;
  onCancel?: () => void;
}) {
  const { message } = App.useApp();
  const { companyId } = useAppNavigation();
  const queryClient = useQueryClient();
  const [form] = Form.useForm<PartFields>();
  const quantity = Form.useWatch("quantity", form);
  const unitPrice = Form.useWatch("unitPrice", form);
  const options = usePartOptions();
  const save = useMutation({
    mutationFn: (values: PartRecordInput | PartRecordUpdate) => apiFetch<PartRecord>(
      record ? `/api/parts/records/${encodeURIComponent(record.id)}` : "/api/parts/records",
      jsonRequest(record ? "PUT" : "POST", values),
    ),
  });

  const initialValues: PartFields = record ? {
    vehicleId: record.vehicleId,
    projectId: record.projectId ?? undefined,
    date: record.date,
    name: record.name,
    quantity: record.quantity,
    unitPrice: record.unitPrice,
    purchaseArea: record.purchaseArea,
    photos: record.photos.map(({ id }) => ({ id })),
  } : { date: today };

  async function submit(values: PartFields) {
    if (save.isPending) return;
    save.reset();
    const { photos, ...details } = values;
    const fields = { ...details, projectId: details.projectId ?? null };
    const input = record && photos && form.isFieldTouched("photos") ? { ...fields, photos } : fields;
    const result = (record ? partRecordUpdateSchema : partRecordInputSchema).safeParse(input);
    if (!result.success) {
      form.setFields(result.error.issues.map(({ path, message }) => ({
        name: path[0] as keyof PartFields,
        errors: [message],
      })));
      return;
    }
    if (result.data.date > today) {
      form.setFields([{ name: "date", errors: ["购买日期不能晚于今天"] }]);
      return;
    }

    try {
      const saved = await save.mutateAsync(result.data);
      if (record) {
        queryClient.setQueryData<PartRecordDetail>(["parts", "detail", companyId, record.id], (detail) =>
          detail ? { ...detail, record: saved } : undefined);
      }
      void queryClient.invalidateQueries({ queryKey: ["parts"] });
      void queryClient.invalidateQueries({ queryKey: ["fuel", "vehicles"] });
      if (!record) form.resetFields();
      message.success(record ? "配件记录已修改。" : "配件记录已保存。");
      onSaved?.();
    } catch {
      // The mutation error appears above the form.
    }
  }

  return (
    <Card className={styles.formCard}>
      {options.vehicles.error && <QueryError error={options.vehicles.error} retry={() => { void options.vehicles.refetch(); }} />}
      {options.projects.error && <QueryError error={options.projects.error} retry={() => { void options.projects.refetch(); }} />}
      {save.error && <QueryError error={save.error} />}
      <Form<PartFields>
        form={form}
        layout="vertical"
        initialValues={initialValues}
        disabled={save.isPending}
        onFinish={submit}
        onValuesChange={(changed: Partial<PartFields>) => {
          if ("vehicleId" in changed) {
            const vehicle = options.vehicles.data?.vehicles.find(({ id }) => id === changed.vehicleId);
            form.setFieldValue("projectId", vehicle?.projectId ?? undefined);
          }
        }}
      >
        <div className={styles.fields}>
          <Form.Item name="vehicleId" label="车牌" rules={required}>
            <Select
              showSearch
              optionFilterProp="label"
              options={options.vehicleOptions}
              loading={options.vehicles.isPending}
              placeholder="搜索并选择车牌"
            />
          </Form.Item>
          <Form.Item name="date" label="购买日期" rules={required}>
            <DateInput maxDate={today} />
          </Form.Item>
          <Form.Item name="name" label="配件名称" rules={required}>
            <Input maxLength={100} placeholder="请输入配件名称" />
          </Form.Item>
          <Form.Item name="purchaseArea" label="购买地区">
            <Input maxLength={100} placeholder="请输入购买地区" />
          </Form.Item>
          <Form.Item name="quantity" label="数量" rules={required}>
            <InputNumber<string> stringMode min="0.001" precision={3} inputMode="decimal" className={styles.numberInput} />
          </Form.Item>
          <Form.Item name="unitPrice" label="单价（元）" rules={required}>
            <InputNumber<string> stringMode min="0" precision={2} inputMode="decimal" className={styles.numberInput} />
          </Form.Item>
        </div>

        <div className={styles.expense}>
          <Form.Item
            name="projectId"
            label="支出归属项目"
            extra="补录时可选择购买当时所属的项目。"
          >
            <Select
              allowClear
              showSearch
              optionFilterProp="label"
              options={options.projectOptions}
              loading={options.projects.isPending}
              placeholder="未分配项目"
            />
          </Form.Item>
          <dl className={styles.amount} aria-live="polite">
            <dt>总价</dt>
            <dd>{moneyText(previewAmount(quantity, unitPrice))} <small>元</small></dd>
          </dl>
        </div>

        {record && record.photos.length > 0 && (
          <Form.Item name="photos" label="已有照片">
            <PartPhotoField disabled={save.isPending} />
          </Form.Item>
        )}
        {record && (
          <Form.Item name="reason" label="修改原因" rules={required}>
            <Input.TextArea maxLength={500} autoSize={{ minRows: 2, maxRows: 5 }} />
          </Form.Item>
        )}
        <Space wrap className={styles.formActions}>
          {onCancel && <Button onClick={onCancel} disabled={save.isPending}>取消</Button>}
          <Button
            type="primary"
            htmlType="submit"
            icon={<SaveOutlined />}
            loading={save.isPending}
            disabled={!options.vehicleOptions || !options.projectOptions}
          >
            {record ? "保存修改" : "保存配件记录"}
          </Button>
        </Space>
      </Form>
    </Card>
  );
}
