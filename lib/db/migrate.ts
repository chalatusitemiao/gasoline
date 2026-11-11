import { randomBytes } from "node:crypto";
import { join } from "node:path";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Client, Pool, type PoolClient } from "pg";

async function verifyMigrationTarget(migration: PoolClient, applicationUrl: string) {
  const application = new Client({ connectionString: applicationUrl, connectionTimeoutMillis: 5_000, query_timeout: 5_000 });
  const probe = randomBytes(8).readBigInt64BE().toString();
  try {
    await migration.query("SELECT pg_advisory_xact_lock($1::bigint)", [probe]);
    await application.connect();
    // A transaction lock is visible only to other connections to this database.
    const { rows } = await application.query<{ sameDatabase: boolean }>(
      'SELECT NOT pg_try_advisory_xact_lock($1::bigint) AS "sameDatabase"', [probe],
    );
    if (!rows[0]?.sameDatabase) {
      throw Object.assign(new Error("应用与迁移连接必须指向同一个数据库"), { code: "DATABASE_MISMATCH" });
    }
  } finally {
    await application.end();
  }
}

export async function migrateDatabase(connectionString: string, applicationUrl: string) {
  const pool = new Pool({ connectionString, max: 2, connectionTimeoutMillis: 5_000 });
  try {
    const lock = await pool.connect();
    try {
      await lock.query("BEGIN");
      await lock.query("SET LOCAL lock_timeout = '15s'");
      await lock.query("SELECT pg_advisory_xact_lock(1662806122, 1)");
      if (connectionString !== applicationUrl) await verifyMigrationTarget(lock, applicationUrl);
      await migrate(drizzle(pool), { migrationsFolder: join(process.cwd(), "drizzle") });
    } finally {
      await lock.query("ROLLBACK").catch(() => undefined);
      lock.release(true);
    }
  } finally {
    await pool.end();
  }
}
