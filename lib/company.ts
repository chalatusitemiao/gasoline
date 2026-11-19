export type CompanyBillingStatus = "unmanaged" | "pending" | "active" | "expired";

export type Company = {
  id: string;
  code: string;
  name: string;
  contactName: string;
  contactPhone: string;
  notes: string;
  isActive: boolean;
  billingStatus: CompanyBillingStatus;
  paidUntil: string | null;
  suspendOnExpiry: boolean;
  createdAt: string;
  updatedAt: string;
  accountCount: number;
  adminCount: number;
};

export type CompanyPage = { items: Company[]; total: number; page: number; pageSize: number };

export type CompanyRenewal = {
  id: string;
  amount: string;
  months: number;
  startsAt: string;
  endsAt: string;
  recordedAt: string;
  recordedBy: string;
};

export type CompanyRenewalPage = { items: CompanyRenewal[]; total: number; page: number; pageSize: number };

export type CompanySummary = {
  companyId: string;
  companyCode: string;
  companyName: string;
  isActive: boolean;
  accountCount: number;
  vehicleCount: number;
  driverCount: number;
  recordCount: number;
  totalLiters: string;
  totalAmount: string;
  anomalyCount: number;
};

export type PlatformSummary = {
  from: string | null;
  to: string | null;
  items: CompanySummary[];
  total: Omit<CompanySummary, "companyId" | "companyCode" | "companyName" | "isActive"> & { companyCount: number };
};
