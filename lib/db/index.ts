import "server-only";

import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

function createPool(connectionString: string) {
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

  return pool;
}

function createDatabase(pool: Pool) {
  return drizzle(pool, { schema });
}

let database: { pool: Pool; db: ReturnType<typeof createDatabase> } | undefined;

const globals = globalThis as typeof globalThis & {
  gasolinePool?: { url: string; pool: Pool };
};

export function getDatabaseUrl() {
  return process.env.DATABASE_URL?.trim() || "";
}

export async function getDb() {
  const databaseUrl = getDatabaseUrl();
  if (!databaseUrl) throw new Error("请配置 DATABASE_URL 环境变量");
  if (!globals.gasolinePool || globals.gasolinePool.url !== databaseUrl) {
    // 旧连接池的空闲连接会自动回收，在途事务可以继续完成。
    globals.gasolinePool = { url: databaseUrl, pool: createPool(databaseUrl) };
  }

  const { pool } = globals.gasolinePool;
  if (!database || database.pool !== pool) {
    database = { pool, db: createDatabase(pool) };
  }
  return database.db;
}
