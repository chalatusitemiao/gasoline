import nextEnv from "@next/env";
import { migrateDatabase } from "../lib/db/migrate.ts";
import { readStoredSettings } from "../lib/system-settings-store.ts";

nextEnv.loadEnvConfig(process.cwd(), process.env.NODE_ENV !== "production");

try {
  const saved = await readStoredSettings();
  const url = saved
    ? saved.settings.migrationDatabaseUrl || saved.settings.databaseUrl
    : process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;

  if (!url) {
    console.error("请先完成系统初始化，再执行数据库迁移。");
    process.exitCode = 1;
  } else {
    await migrateDatabase(url);
    console.log("数据库迁移完成。");
  }
} catch (error) {
  const code = typeof error?.code === "string" && /^[A-Z0-9_]{1,30}$/.test(error.code) ? `（${error.code}）` : "";
  console.error(`数据库迁移失败${code}，请核对系统设置、数据库连接和迁移权限。`);
  process.exitCode = 1;
}
