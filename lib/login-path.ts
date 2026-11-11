export const returnToHeader = "x-fuel-return-to";
export const homePath = "/dashboard";

export function safeReturnTo(value: unknown): string {
  if (typeof value !== "string" || !value.startsWith("/") || value.startsWith("//")) {
    return homePath;
  }

  const base = "https://gasoline.invalid";
  try {
    const url = new URL(value, base);
    if (url.origin !== base || url.pathname.startsWith("//") ||
        url.pathname === "/login" || url.pathname.startsWith("/login/") ||
        url.pathname === "/register" || url.pathname.startsWith("/register/") ||
        url.pathname === "/api" || url.pathname.startsWith("/api/")) {
      return homePath;
    }
    return url.pathname + url.search + url.hash;
  } catch {
    return homePath;
  }
}

export function loginPath(value: unknown) {
  return "/login?next=" + encodeURIComponent(safeReturnTo(value));
}
