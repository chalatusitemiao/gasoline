import "server-only";

import { createHash, randomUUID, timingSafeEqual } from "node:crypto";
import { and, count, eq, sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { loginAttempts } from "@/lib/db/auth-guard-schema";
import { authMigrationState, session, user, userCredential } from "@/lib/db/schema";
import { ApiError } from "@/lib/api-error";
import { getSystemSettings, hashSettingsPassword, verifySettingsPassword } from "@/lib/system-settings";

export const fleetAccountId = "gasoline-single-account";
const migrationStateId = "legacy-single-account";
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

export function normalizeUsername(username: string) {
  return username.trim().normalize("NFKC").toLocaleLowerCase("en-US");
}

export function userEmail(username: string) {
  const key = createHash("sha256").update(normalizeUsername(username)).digest("hex");
  return `gasoline-${key}@localhost.invalid`;
}

export async function upsertFleetUser(
  tx: Pick<Awaited<ReturnType<typeof getDb>>, "insert" | "update">,
  username: string,
  passwordHash: string,
) {
  const [accountUser] = await tx.insert(user).values({
    id: fleetAccountId,
    name: username,
    username: normalizeUsername(username),
    role: "admin",
    isActive: true,
    email: "gasoline-single-account@localhost.invalid",
  }).onConflictDoUpdate({
    target: user.id,
    set: { name: username, username: normalizeUsername(username), role: "admin", isActive: true, updatedAt: new Date() },
  }).returning();

  await tx.insert(userCredential).values({ userId: accountUser.id, passwordHash })
    .onConflictDoUpdate({
      target: userCredential.userId,
      set: { passwordHash, updatedAt: new Date() },
    });
  await tx.insert(authMigrationState).values({ id: migrationStateId, legacyCredentialsMigrated: true })
    .onConflictDoUpdate({
      target: authMigrationState.id,
      set: { legacyCredentialsMigrated: true },
    });

  return accountUser;
}

export async function authorizeFuelAccount(username: string, password: string) {
  const normalizedUsername = normalizeUsername(username);
  if (!normalizedUsername) return null;
  const db = await getDb();
  return db.transaction(async (tx) => {
    const attemptId = `user:${createHash("sha256").update(normalizedUsername).digest("hex")}`;
    await tx.insert(loginAttempts).values({ id: attemptId }).onConflictDoNothing();
    const [attempts] = await tx.select().from(loginAttempts)
      .where(eq(loginAttempts.id, attemptId)).for("update");
    const now = Date.now();
    if (attempts.lockedUntil && attempts.lockedUntil.getTime() > now) return null;

    await tx.insert(authMigrationState).values({ id: migrationStateId }).onConflictDoNothing();
    const [migrationState] = await tx.select().from(authMigrationState)
      .where(eq(authMigrationState.id, migrationStateId)).for("update");
    const [accountUser] = await tx.select().from(user)
      .where(eq(user.username, normalizedUsername)).limit(1);
    const [credential] = accountUser
      ? await tx.select({ passwordHash: userCredential.passwordHash }).from(userCredential)
        .where(eq(userCredential.userId, accountUser.id)).limit(1)
      : [];

    let correctPassword = credential
      ? await verifySettingsPassword(password, credential.passwordHash)
      : false;

    if (!correctPassword && !credential && !migrationState.legacyCredentialsMigrated) {
      const legacy = await getSystemSettings();
      const matchesLegacyUsername = Boolean(legacy.username) &&
        matches(normalizedUsername, normalizeUsername(legacy.username));
      const matchesLegacyPassword = await verifySettingsPassword(password, legacy.passwordHash);
      if (matchesLegacyUsername && matchesLegacyPassword) {
        await upsertFleetUser(tx, legacy.username, legacy.passwordHash);
        await tx.update(loginAttempts).set({ failures: 0, lockedUntil: null })
          .where(eq(loginAttempts.id, attemptId));
        const [migratedUser] = await tx.select().from(user)
          .where(eq(user.username, normalizedUsername)).limit(1);
        return migratedUser?.isActive ? migratedUser : null;
      }
    }

    if (!accountUser?.isActive || !credential) {
      await verifySettingsPassword(password, "00000000000000000000000000000000:" + "0".repeat(128));
      correctPassword = false;
    }

    if (!accountUser || !accountUser.isActive || !correctPassword) {
      const failures = (attempts.lockedUntil ? 0 : attempts.failures) + 1;
      await tx.update(loginAttempts).set({
        failures,
        lockedUntil: failures >= failureLimit ? new Date(now + lockDuration) : null,
      }).where(eq(loginAttempts.id, attemptId));
      return null;
    }

    await tx.update(loginAttempts).set({ failures: 0, lockedUntil: null })
      .where(eq(loginAttempts.id, attemptId));
    await tx.update(authMigrationState).set({ legacyCredentialsMigrated: true })
      .where(eq(authMigrationState.id, migrationStateId));

    return accountUser;
  });
}

export async function ensureLegacyFuelAccountMigrated(userId: string) {
  if (userId !== fleetAccountId) return;
  const db = await getDb();
  const [currentState] = await db.select({
    legacyCredentialsMigrated: authMigrationState.legacyCredentialsMigrated,
  }).from(authMigrationState).where(eq(authMigrationState.id, migrationStateId)).limit(1);
  if (currentState?.legacyCredentialsMigrated) return;

  const legacySettings = await getSystemSettings();
  if (!legacySettings.username || !legacySettings.passwordHash) return;

  await db.transaction(async (tx) => {
    await tx.insert(authMigrationState).values({ id: migrationStateId }).onConflictDoNothing();
    const [migrationState] = await tx.select().from(authMigrationState)
      .where(eq(authMigrationState.id, migrationStateId)).for("update");
    if (migrationState.legacyCredentialsMigrated) return;

    const [legacyAdmin] = await tx.select({ id: user.id }).from(user)
      .where(eq(user.id, fleetAccountId)).limit(1);
    if (!legacyAdmin) return;

    await tx.insert(userCredential).values({
      userId: legacyAdmin.id,
      passwordHash: legacySettings.passwordHash,
    }).onConflictDoNothing();
    await tx.update(authMigrationState).set({ legacyCredentialsMigrated: true })
      .where(eq(authMigrationState.id, migrationStateId));
  });
}

export async function createFuelUser(input: { username: string; role: "admin" | "operator" | "viewer"; password: string }) {
  const db = await getDb();
  const username = input.username.trim();
  const normalizedUsername = normalizeUsername(username);
  const passwordHash = await hashSettingsPassword(input.password);
  const legacySettings = await getSystemSettings();
  try {
    return await db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(1662806122, 2)`);
      await tx.insert(authMigrationState).values({ id: migrationStateId }).onConflictDoNothing();
      const [migrationState] = await tx.select().from(authMigrationState)
        .where(eq(authMigrationState.id, migrationStateId)).for("update");
      if (!migrationState.legacyCredentialsMigrated && legacySettings.username && legacySettings.passwordHash) {
        const [legacyAdmin] = await tx.select({ id: user.id }).from(user)
          .where(eq(user.id, fleetAccountId)).limit(1);
        if (legacyAdmin) {
          await tx.insert(userCredential).values({
            userId: legacyAdmin.id,
            passwordHash: legacySettings.passwordHash,
          }).onConflictDoNothing();
        }
      }

      const [accountUser] = await tx.insert(user).values({
        id: randomUUID(),
        name: username,
        username: normalizedUsername,
        role: input.role,
        isActive: true,
        email: userEmail(username),
      }).returning({
        id: user.id,
        name: user.name,
        username: user.username,
        role: user.role,
        isActive: user.isActive,
        createdAt: user.createdAt,
      });
      await tx.insert(userCredential).values({ userId: accountUser.id, passwordHash });
      await tx.insert(authMigrationState).values({ id: migrationStateId, legacyCredentialsMigrated: true })
        .onConflictDoUpdate({
          target: authMigrationState.id,
          set: { legacyCredentialsMigrated: true },
        });
      return accountUser;
    });
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "23505") {
      throw new ApiError(409, "该用户名已存在");
    }
    throw error;
  }
}

export async function setFuelUserAccess(
  id: string,
  input: { role: "admin" | "operator" | "viewer"; isActive: boolean; password?: string },
) {
  const db = await getDb();
  const passwordHash = input.password ? await hashSettingsPassword(input.password) : null;
  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(1662806122, 2)`);
    const [target] = await tx.select({ id: user.id, role: user.role, isActive: user.isActive })
      .from(user).where(eq(user.id, id)).for("update");
    if (!target) return null;

    if (target.role === "admin" && target.isActive && (input.role !== "admin" || !input.isActive)) {
      const [activeAdmins] = await tx.select({ total: count() }).from(user)
        .where(and(eq(user.role, "admin"), eq(user.isActive, true)));
      if (activeAdmins.total <= 1) throw new ApiError(409, "至少保留一名有效管理员");
    }

    const [updated] = await tx.update(user).set({
      role: input.role,
      isActive: input.isActive,
      updatedAt: new Date(),
    }).where(eq(user.id, id)).returning({
      id: user.id,
      name: user.name,
      username: user.username,
      role: user.role,
      isActive: user.isActive,
      createdAt: user.createdAt,
    });

    if (passwordHash) {
      await tx.insert(userCredential).values({ userId: id, passwordHash })
        .onConflictDoUpdate({
          target: userCredential.userId,
          set: { passwordHash, updatedAt: new Date() },
        });
    }
    if (passwordHash || !input.isActive) {
      await tx.delete(session).where(eq(session.userId, id));
    }
    return updated;
  });
}

export async function listFuelUsers() {
  const db = await getDb();
  return db.select({
    id: user.id,
    name: user.name,
    username: user.username,
    role: user.role,
    isActive: user.isActive,
    createdAt: user.createdAt,
  }).from(user).orderBy(user.createdAt, user.username);
}
