"use client";

import { DatePicker, type DatePickerProps } from "antd";
import dayjs from "dayjs";

type Picker = "date" | "month";
type DateInputProps = Omit<DatePickerProps, "value" | "defaultValue" | "onChange" | "picker" | "format" | "maxDate" | "multiple"> & {
  value?: string | null;
  onChange?: (value: string | undefined) => void;
  picker?: Picker;
  maxDate?: string;
};

function toPickerValue(value: string, picker: Picker) {
  const date = picker === "month" ? `${value}-01` : value;
  return dayjs(new Date(`${date}T00:00:00`));
}

export function DateInput({ value, onChange, picker = "date", maxDate, style, ...props }: DateInputProps) {
  const format = picker === "month" ? "YYYY-MM" : "YYYY-MM-DD";

  return (
    <DatePicker
      {...props}
      picker={picker}
      format={format}
      value={value ? toPickerValue(value, picker) : null}
      maxDate={maxDate ? toPickerValue(maxDate, picker) : undefined}
      onChange={(date) => onChange?.(date?.format(format))}
      style={{ width: "100%", ...style }}
    />
  );
}
