import "server-only";

import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
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

export function getDatabaseUrl() {
  return process.env.DATABASE_URL?.trim() || "";
}

export async function getDb() {
  const databaseUrl = getDatabaseUrl();
  if (!databaseUrl) throw new Error("请配置 DATABASE_URL 环境变量");
  if (!globals.gasolineDatabase || globals.gasolineDatabase.url !== databaseUrl) {
    // 旧连接池的空闲连接会自动回收，在途事务可以继续完成。
    globals.gasolineDatabase = { url: databaseUrl, db: createDatabase(databaseUrl) };
  }

  return globals.gasolineDatabase.db;
}
