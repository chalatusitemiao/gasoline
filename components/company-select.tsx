"use client";

import { useQuery } from "@tanstack/react-query";
import { Select } from "antd";
import { useState, type CSSProperties } from "react";
import { apiFetch } from "@/lib/api-client";
import type { CompanyPage } from "@/lib/company";

export function CompanySelect({ value, onChange, allowClear = true, disabled, placeholder = "全部公司", style }: {
  value?: string;
  onChange?: (value: string | undefined) => void;
  allowClear?: boolean;
  disabled?: boolean;
  placeholder?: string;
  style?: CSSProperties;
}) {
  const [keyword, setKeyword] = useState("");
  const companies = useQuery({
    queryKey: ["companies", "choices", keyword],
    queryFn: ({ signal }) => apiFetch<CompanyPage>(`/api/companies?${new URLSearchParams({ keyword, pageSize: "100" })}`, { signal }),
  });
  return (
    <Select<string>
      aria-label="选择公司"
      value={value}
      onChange={onChange}
      allowClear={allowClear}
      disabled={disabled}
      showSearch
      filterOption={false}
      onSearch={setKeyword}
      placeholder={placeholder}
      loading={companies.isFetching}
      labelRender={({ label }) => label ?? "已选公司"}
      options={(companies.data?.items ?? []).map((company) => ({
        value: company.id,
        label: company.isActive ? company.name : `${company.name} · 已停用`,
      }))}
      notFoundContent={companies.isError ? "公司读取失败，请重新搜索" : companies.isFetching ? "正在读取…" : "没有匹配公司"}
      style={{ minWidth: 240, maxWidth: "100%", ...style }}
    />
  );
}
