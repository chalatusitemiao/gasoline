import { integer, pgTable, text, timestamp } from "drizzle-orm/pg-core";

export const loginAttempts = pgTable("login_attempts", {
  id: text("id").primaryKey(),
  failures: integer("failures").default(0).notNull(),
  lockedUntil: timestamp("locked_until", { withTimezone: true }),
});
