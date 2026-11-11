import { join } from "node:path";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";

export async function migrateDatabase(connectionString: string) {
  const pool = new Pool({ connectionString, max: 2, connectionTimeoutMillis: 5_000 });
  try {
    const lock = await pool.connect();
    try {
      await lock.query("BEGIN");
      await lock.query("SET LOCAL lock_timeout = '15s'");
      await lock.query("SELECT pg_advisory_xact_lock(1662806122, 1)");
      await migrate(drizzle(pool), { migrationsFolder: join(process.cwd(), "drizzle") });
    } finally {
      await lock.query("ROLLBACK").catch(() => undefined);
      lock.release(true);
    }
  } finally {
    await pool.end();
  }
}
