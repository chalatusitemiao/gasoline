import nextEnv from "@next/env";
import { migrateDatabase } from "../lib/db/migrate.ts";

nextEnv.loadEnvConfig(process.cwd(), !process.env.VERCEL && process.env.NODE_ENV !== "production");

try {
  const databaseUrl = process.env.DATABASE_URL?.trim();
  const migrationUrl = process.env.DATABASE_URL_UNPOOLED?.trim() || databaseUrl;

  if (!databaseUrl || !migrationUrl) {
    console.error("请先配置 DATABASE_URL 环境变量。");
    process.exitCode = 1;
  } else {
    await migrateDatabase(migrationUrl, databaseUrl);
    console.log("数据库迁移完成。");
  }
} catch (error) {
  const code = typeof error?.code === "string" && /^[A-Z0-9_]{1,30}$/.test(error.code) ? `（${error.code}）` : "";
  const message = code === "（DATABASE_MISMATCH）"
    ? "数据库迁移失败，DATABASE_URL_UNPOOLED 与 DATABASE_URL 必须指向同一个数据库。"
    : `数据库迁移失败${code}，请核对数据库连接和迁移权限。`;
  console.error(message);
  process.exitCode = 1;
}
