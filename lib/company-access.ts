import type { CompanyBillingStatus } from "./company";

export function companyBillingStatus(billingRequired: boolean, paidUntil: Date | null, now = new Date()): CompanyBillingStatus {
  if (!paidUntil) return billingRequired ? "pending" : "unmanaged";
  return paidUntil.getTime() > now.getTime() ? "active" : "expired";
}

export function blockedCompanyBillingStatus({ billingRequired, paidUntil, suspendOnExpiry }: {
  billingRequired: boolean;
  paidUntil: Date | null;
  suspendOnExpiry: boolean;
}) {
  const status = companyBillingStatus(billingRequired, paidUntil);
  if (status === "pending" || (status === "expired" && suspendOnExpiry)) return status;
  return null;
}

export const companyBillingDenials = {
  pending: { code: "COMPANY_BILLING_PENDING", message: "公司租期尚未开通，请联系平台管理员" },
  expired: { code: "COMPANY_BILLING_EXPIRED", message: "公司租期已到期，请联系平台管理员续费" },
} as const;
