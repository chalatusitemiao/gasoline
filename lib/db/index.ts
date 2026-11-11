import "server-only";

import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

function createDatabase(connectionString: string) {
  const pool = new Pool({
    connectionString,
    max: 5,
    connectionTimeoutMillis: 5_000,
    idleTimeoutMillis: 10_000,
  });

  pool.on("error", () => {
    console.error("PostgreSQL 空闲连接异常");
  });

  return drizzle(pool, { schema });
}

const globals = globalThis as typeof globalThis & {
  gasolineDatabase?: ReturnType<typeof createDatabase>;
};

export function getDb() {
  if (!globals.gasolineDatabase) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) throw new Error("请设置 DATABASE_URL");

    globals.gasolineDatabase = createDatabase(connectionString);
  }

  return globals.gasolineDatabase;
}
