import nextEnv from "@next/env";
import { setupCode } from "../lib/system-settings-store.ts";

nextEnv.loadEnvConfig(process.cwd(), process.env.NODE_ENV !== "production");

try {
  console.log(setupCode());
} catch {
  console.error("请在目标环境中设置至少 32 个字符的 BETTER_AUTH_SECRET。");
  process.exitCode = 1;
}
