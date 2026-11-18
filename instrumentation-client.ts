const clarityProjectId = process.env.NEXT_PUBLIC_CLARITY_PROJECT_ID?.trim();
const vercelEnvironment = process.env.NEXT_PUBLIC_VERCEL_ENV;
const isProduction = process.env.NODE_ENV === "production"
  && (!vercelEnvironment || vercelEnvironment === "production");

if (isProduction && clarityProjectId) {
  void import("@microsoft/clarity")
    .then(({ default: Clarity }) => Clarity.init(clarityProjectId))
    .catch((error: unknown) => console.warn("Clarity 初始化失败", error));
}
