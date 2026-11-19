export const companyUserRoles = ["admin", "operator", "viewer"] as const;
export type CompanyUserRole = (typeof companyUserRoles)[number];
export const userRoles = ["super_admin", ...companyUserRoles] as const;
export type UserRole = (typeof userRoles)[number];

export const permissions = [
  "dashboard:view",
  "records:view",
  "records:create",
  "records:edit",
  "records:edit:any",
  "records:delete",
  "records:import",
  "records:export",
  "records:deletions:view",
  "reports:view",
  "reports:export",
  "archives:view",
  "archives:manage",
  "archives:import",
  "settings:manage",
  "users:manage",
  "docs:view",
  "companies:manage",
  "platform:view",
  "platform:settings",
] as const;
export type Permission = (typeof permissions)[number];

const rolePermissions: Record<UserRole, readonly Permission[]> = {
  super_admin: ["companies:manage", "users:manage", "platform:view", "platform:settings", "docs:view"],
  admin: permissions.filter((permission) => permission !== "companies:manage"
    && permission !== "platform:view" && permission !== "platform:settings"),
  operator: [
    "dashboard:view",
    "records:view",
    "records:create",
    "records:edit",
    "reports:view",
    "archives:view",
    "docs:view",
  ],
  viewer: [
    "dashboard:view",
    "records:view",
    "reports:view",
    "archives:view",
    "docs:view",
  ],
};

export function isUserRole(value: string): value is UserRole {
  return userRoles.includes(value as UserRole);
}

export function isCompanyUserRole(value: string): value is CompanyUserRole {
  return companyUserRoles.includes(value as CompanyUserRole);
}

export function permissionsForRole(role: UserRole): readonly Permission[] {
  return rolePermissions[role];
}

export function hasPermission(granted: readonly string[], required: Permission) {
  return granted.includes(required);
}

export function pagePermission(pathname: string, granted: readonly string[] = []): Permission | null {
  if (pathname === "/dashboard" || pathname === "/") {
    return granted.includes("platform:view") ? "platform:view" : "dashboard:view";
  }
  if (pathname === "/refuel") return "records:create";
  if (pathname === "/records" || pathname.startsWith("/records/")) return "records:view";
  if (pathname === "/import") return "records:import";
  if (pathname === "/vehicle-report" || pathname === "/driver-report" || pathname === "/costs") {
    return "reports:view";
  }
  if (pathname === "/vehicles" || pathname === "/drivers") return "archives:view";
  if (pathname === "/settings") return "settings:manage";
  if (pathname === "/users") return "users:manage";
  if (pathname === "/companies") return "companies:manage";
  if (pathname === "/docs" || pathname === "/calculation-docs") return "docs:view";
  return null;
}

export function roleLabel(role: UserRole) {
  return role === "super_admin" ? "超级管理员"
    : role === "admin" ? "公司管理员" : role === "operator" ? "录入员" : "只读人员";
}
