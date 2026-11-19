import "server-only";

import { createHash, randomUUID, timingSafeEqual } from "node:crypto";
import { and, count, eq, or, sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { loginAttempts } from "@/lib/db/auth-guard-schema";
import { companies, companyAuditLogs } from "@/lib/db/company-schema";
import { authMigrationState, session, user, userCredential } from "@/lib/db/schema";
import { ApiError } from "@/lib/api-error";
import { isCompanyUserRole, isUserRole, type CompanyUserRole } from "@/lib/permissions";
import type { ApiActor } from "@/lib/server-api";
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

export async function hasRegisteredFuelAccount(reader?: Pick<Awaited<ReturnType<typeof getDb>>, "select">) {
  const db = reader ?? await getDb();
  const [registered] = await db.select({ id: user.id }).from(user)
    .where(or(eq(user.id, fleetAccountId), eq(user.role, "super_admin"))).limit(1);
  return Boolean(registered);
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
    role: "super_admin",
    companyId: null,
    isActive: true,
    email: "gasoline-single-account@localhost.invalid",
  }).onConflictDoUpdate({
    target: user.id,
    set: {
      name: username, username: normalizeUsername(username), role: "super_admin",
      companyId: null, isActive: true, updatedAt: new Date(),
    },
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

    let accountAvailable = Boolean(accountUser?.isActive && isUserRole(accountUser.role));
    if (accountUser?.role === "super_admin") {
      accountAvailable = accountAvailable && accountUser.companyId === null;
    } else if (accountUser?.companyId) {
      const [company] = await tx.select({ isActive: companies.isActive }).from(companies)
        .where(eq(companies.id, accountUser.companyId)).limit(1);
      accountAvailable = accountAvailable && Boolean(company?.isActive);
    } else {
      accountAvailable = false;
    }

    if (!accountAvailable || !credential) {
      await verifySettingsPassword(password, "00000000000000000000000000000000:" + "0".repeat(128));
      correctPassword = false;
    }

    if (!accountUser || !accountAvailable || !correctPassword) {
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

const userFields = {
  id: user.id,
  name: user.name,
  username: user.username,
  role: user.role,
  companyId: user.companyId,
  isActive: user.isActive,
  createdAt: user.createdAt,
};

function requireUserManager(actor: ApiActor) {
  if (actor.role !== "super_admin" && actor.role !== "admin") {
    throw new ApiError(403, "当前账号没有管理账号的权限");
  }
  if (actor.role === "admin" && !actor.companyId) throw new ApiError(403, "账号尚未归属公司");
}

export async function createFuelUser(
  input: { username: string; role: CompanyUserRole; password: string; companyId?: string },
  actor: ApiActor,
) {
  requireUserManager(actor);
  if (!isCompanyUserRole(input.role)) throw new ApiError(403, "不能创建超级管理员");
  if (actor.role === "admin" && input.companyId && input.companyId !== actor.companyId) {
    throw new ApiError(403, "只能在本公司创建账号");
  }
  const companyId = actor.role === "super_admin" ? input.companyId : actor.companyId;
  if (!companyId) throw new ApiError(400, "请选择账号所属公司");
  const db = await getDb();
  const username = input.username.trim();
  const normalizedUsername = normalizeUsername(username);
  const passwordHash = await hashSettingsPassword(input.password);
  const legacySettings = await getSystemSettings();
  try {
    return await db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(1662806122, 2)`);
      const [company] = await tx.select({ id: companies.id, name: companies.name, isActive: companies.isActive })
        .from(companies).where(eq(companies.id, companyId)).for("update");
      if (!company) throw new ApiError(404, "公司不存在");
      if (!company.isActive && actor.role !== "super_admin") throw new ApiError(403, "公司已停用");
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
        companyId,
        isActive: true,
        email: userEmail(username),
      }).returning(userFields);
      await tx.insert(userCredential).values({ userId: accountUser.id, passwordHash });
      await tx.insert(authMigrationState).values({ id: migrationStateId, legacyCredentialsMigrated: true })
        .onConflictDoUpdate({
          target: authMigrationState.id,
          set: { legacyCredentialsMigrated: true },
        });
      await tx.insert(companyAuditLogs).values({
        companyId, actorId: actor.id, actorName: actor.name,
        action: "account.create", targetId: accountUser.id,
        details: { username: accountUser.username, role: accountUser.role },
      });
      return { ...accountUser, companyName: company.name };
    });
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new ApiError(409, "该用户名已存在");
    }
    throw error;
  }
}

export async function setFuelUserAccess(
  id: string,
  input: { role: CompanyUserRole; isActive: boolean; password?: string },
  actor: ApiActor,
) {
  requireUserManager(actor);
  if (!isCompanyUserRole(input.role)) throw new ApiError(403, "不能分配超级管理员角色");
  const db = await getDb();
  const passwordHash = input.password ? await hashSettingsPassword(input.password) : null;
  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(1662806122, 2)`);
    const [target] = await tx.select(userFields).from(user)
      .where(and(eq(user.id, id), actor.role === "admin" ? eq(user.companyId, actor.companyId!) : undefined))
      .for("update");
    if (!target) return null;
    if (target.role === "super_admin") throw new ApiError(403, "超级管理员的角色和状态不能修改，请通过个人密码入口修改密码");
    if (!target.companyId) throw new ApiError(409, "目标账号尚未归属公司");
    const [company] = await tx.select({ name: companies.name }).from(companies)
      .where(eq(companies.id, target.companyId)).limit(1);
    if (!company) throw new ApiError(404, "公司不存在");

    if (target.role === "admin" && target.isActive && (input.role !== "admin" || !input.isActive)) {
      const [activeAdmins] = await tx.select({ total: count() }).from(user)
        .where(and(eq(user.companyId, target.companyId), eq(user.role, "admin"), eq(user.isActive, true)));
      if (activeAdmins.total <= 1) throw new ApiError(409, "每家公司至少保留一名有效公司管理员");
    }

    const [updated] = await tx.update(user).set({
      role: input.role,
      isActive: input.isActive,
      updatedAt: new Date(),
    }).where(eq(user.id, id)).returning(userFields);

    if (passwordHash) {
      await tx.insert(userCredential).values({ userId: id, passwordHash })
        .onConflictDoUpdate({
          target: userCredential.userId,
          set: { passwordHash, updatedAt: new Date() },
        });
    }
    if (passwordHash || target.role !== input.role || target.isActive !== input.isActive) {
      await tx.delete(session).where(eq(session.userId, id));
    }
    await tx.insert(companyAuditLogs).values({
      companyId: target.companyId, actorId: actor.id, actorName: actor.name,
      action: !input.isActive && target.isActive ? "account.disable"
        : input.isActive && !target.isActive ? "account.enable"
          : passwordHash ? "account.password_reset" : "account.update",
      targetId: id,
      details: {
        before: { role: target.role, isActive: target.isActive },
        after: { role: input.role, isActive: input.isActive },
        passwordReset: Boolean(passwordHash),
      },
    });
    return { ...updated, companyName: company.name };
  });
}

export async function listFuelUsers(actor: ApiActor, companyId?: string) {
  requireUserManager(actor);
  if (actor.role === "admin" && companyId && companyId !== actor.companyId) {
    throw new ApiError(403, "只能查看本公司账号");
  }
  const scope = actor.role === "super_admin" ? companyId : actor.companyId;
  const db = await getDb();
  return db.select({
    ...userFields,
    companyName: companies.name,
  }).from(user).leftJoin(companies, eq(user.companyId, companies.id))
    .where(scope ? eq(user.companyId, scope) : undefined)
    .orderBy(user.createdAt, user.username);
}

export async function changeOwnFuelPassword(actor: ApiActor, currentPassword: string, password: string) {
  const db = await getDb();
  const passwordHash = await hashSettingsPassword(password);
  await db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(1662806122, 2)`);
    const [credential] = await tx.select({ passwordHash: userCredential.passwordHash }).from(userCredential)
      .where(eq(userCredential.userId, actor.id)).for("update");
    if (!credential || !await verifySettingsPassword(currentPassword, credential.passwordHash)) {
      throw new ApiError(400, "当前密码不正确");
    }
    await tx.update(userCredential).set({ passwordHash, updatedAt: new Date() })
      .where(eq(userCredential.userId, actor.id));
    await tx.delete(session).where(eq(session.userId, actor.id));
    await tx.insert(companyAuditLogs).values({
      companyId: actor.companyId, actorId: actor.id, actorName: actor.name,
      action: "account.password_change", targetId: actor.id, details: {},
    });
  });
}

function isUniqueViolation(error: unknown): boolean {
  for (let current = error; current && typeof current === "object";) {
    if ("code" in current && current.code === "23505") return true;
    current = "cause" in current ? current.cause : null;
  }
  return false;
}
