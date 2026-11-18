export const userRoles = ["admin", "operator", "viewer"] as const;
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
] as const;
export type Permission = (typeof permissions)[number];

const rolePermissions: Record<UserRole, readonly Permission[]> = {
  admin: permissions,
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

export function permissionsForRole(role: UserRole): readonly Permission[] {
  return rolePermissions[role];
}

export function hasPermission(granted: readonly string[], required: Permission) {
  return granted.includes(required);
}

export function pagePermission(pathname: string): Permission | null {
  if (pathname === "/dashboard" || pathname === "/") return "dashboard:view";
  if (pathname === "/refuel") return "records:create";
  if (pathname === "/records" || pathname.startsWith("/records/")) return "records:view";
  if (pathname === "/import") return "records:import";
  if (pathname === "/vehicle-report" || pathname === "/driver-report" || pathname === "/costs") {
    return "reports:view";
  }
  if (pathname === "/vehicles" || pathname === "/drivers") return "archives:view";
  if (pathname === "/settings") return "settings:manage";
  if (pathname === "/users") return "users:manage";
  if (pathname === "/docs" || pathname === "/calculation-docs") return "docs:view";
  return null;
}

export function roleLabel(role: UserRole) {
  return role === "admin" ? "管理员" : role === "operator" ? "录入员" : "只读人员";
}
