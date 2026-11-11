import "server-only";

import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { getSystemSettings } from "../system-settings";
import * as schema from "./schema";

function createDatabase(connectionString: string) {
  const pool = new Pool({
    connectionString,
    max: 5,
    connectionTimeoutMillis: 15_000,
    idleTimeoutMillis: 30_000,
    allowExitOnIdle: true,
  });

  pool.on("error", () => {
    console.error("PostgreSQL 空闲连接异常");
  });

  return drizzle(pool, { schema });
}

const globals = globalThis as typeof globalThis & {
  gasolineDatabase?: { url: string; db: ReturnType<typeof createDatabase> };
};

export async function getDb() {
  const { databaseUrl } = await getSystemSettings();
  if (!databaseUrl) throw new Error("请先在系统设置中配置数据库");
  if (!globals.gasolineDatabase || globals.gasolineDatabase.url !== databaseUrl) {
    // 旧连接池的空闲连接会自动回收，在途事务可以继续完成。
    globals.gasolineDatabase = { url: databaseUrl, db: createDatabase(databaseUrl) };
  }

  return globals.gasolineDatabase.db;
}
