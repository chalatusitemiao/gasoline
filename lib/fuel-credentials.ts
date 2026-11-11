import "server-only";

import { createHash, timingSafeEqual } from "node:crypto";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { loginAttempts } from "@/lib/db/auth-guard-schema";
import { user } from "@/lib/db/schema";
import { getSystemSettings, verifySettingsPassword } from "@/lib/system-settings";

export const fleetAccountId = "gasoline-single-account";
const lockDuration = 5 * 60 * 1000;
const failureLimit = 5;

function matches(input: string, expected: string) {
  const hash = (value: string) => createHash("sha256").update(value).digest();
  return timingSafeEqual(hash(input), hash(expected));
}

export function getRegistrationKey() {
  return process.env.REGISTRATION_KEY?.trim() || "";
}

export function matchesRegistrationKey(input: string) {
  const expected = getRegistrationKey();
  return Boolean(expected && matches(input, expected));
}

export async function authorizeFuelAccount(username: string, password: string) {
  const { username: expectedUsername, passwordHash } = await getSystemSettings();
  if (!expectedUsername || !passwordHash) throw new Error("未配置油量监控账号");

  const db = await getDb();
  return db.transaction(async (tx) => {
    await tx.insert(loginAttempts).values({ id: fleetAccountId }).onConflictDoNothing();
    const [attempts] = await tx.select().from(loginAttempts)
      .where(eq(loginAttempts.id, fleetAccountId)).for("update");
    const now = Date.now();
    if (attempts.lockedUntil && attempts.lockedUntil.getTime() > now) return null;

    const correctUsername = matches(username, expectedUsername);
    const correctPassword = await verifySettingsPassword(password, passwordHash);
    if (!correctUsername || !correctPassword) {
      const failures = (attempts.lockedUntil ? 0 : attempts.failures) + 1;
      await tx.update(loginAttempts).set({
        failures,
        lockedUntil: failures >= failureLimit ? new Date(now + lockDuration) : null,
      }).where(eq(loginAttempts.id, fleetAccountId));
      return null;
    }

    await tx.update(loginAttempts).set({ failures: 0, lockedUntil: null })
      .where(eq(loginAttempts.id, fleetAccountId));

    const [accountUser] = await tx.insert(user).values({
      id: fleetAccountId,
      name: expectedUsername,
      email: "gasoline-single-account@localhost.invalid",
    }).onConflictDoUpdate({
      target: user.id,
      set: { name: expectedUsername, updatedAt: new Date(now) },
    }).returning();

    return accountUser;
  });
}
