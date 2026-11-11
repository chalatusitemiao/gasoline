import "server-only";

import { AsyncLocalStorage } from "node:async_hooks";
import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { cache } from "react";
import { readStoredSettings, type SystemSettings } from "./system-settings-store";

export type { SystemSettings } from "./system-settings-store";

export const defaultSystemSettings: SystemSettings = {
  authUrl: "",
  databaseUrl: "",
  migrationDatabaseUrl: "",
  username: "",
  passwordHash: "",
  timeZone: "Asia/Shanghai",
  baselineSamples: 5,
  anomalyMultiplier: 1.3,
};

function derivePassword(password: string, salt: Buffer) {
  return new Promise<Buffer>((resolve, reject) => {
    scrypt(password, salt, 64, (error, key) => {
      if (error) reject(error);
      else resolve(key);
    });
  });
}

export async function hashSettingsPassword(password: string) {
  const salt = randomBytes(16);
  const digest = await derivePassword(password, salt);
  return `${salt.toString("hex")}:${digest.toString("hex")}`;
}

export async function verifySettingsPassword(password: string, hash: string) {
  if (!/^[a-f0-9]{32}:[a-f0-9]{128}$/.test(hash)) return false;
  const [salt, digest] = hash.split(":");
  const expected = Buffer.from(digest, "hex");
  const actual = await derivePassword(password, Buffer.from(salt, "hex"));
  return timingSafeEqual(actual, expected);
}

export function isSystemConfigured(settings: SystemSettings) {
  return Boolean(settings.databaseUrl && settings.username && settings.passwordHash);
}

export function isBusinessTimeZone(value: string) {
  if (!/^[A-Za-z][A-Za-z0-9_+-]*(?:\/[A-Za-z0-9_+-]+)*$/.test(value)) return false;
  try {
    new Intl.DateTimeFormat("zh-CN", { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

let legacyPassword: { value: string; hash: Promise<string> } | undefined;

async function legacyPasswordHash(value: string | undefined) {
  if (!value) return "";
  if (!legacyPassword || legacyPassword.value !== value) {
    legacyPassword = { value, hash: hashSettingsPassword(value) };
  }
  return legacyPassword.hash;
}

async function readLegacySettings(): Promise<SystemSettings> {
  const samples = Number(process.env.FUEL_BASELINE_SAMPLES);
  const multiplier = Number(process.env.FUEL_ANOMALY_MULTIPLIER);
  const zone = process.env.FUEL_TIME_ZONE;
  return {
    authUrl: process.env.BETTER_AUTH_URL?.trim() || "",
    databaseUrl: process.env.DATABASE_URL?.trim() || "",
    migrationDatabaseUrl: process.env.DATABASE_URL_UNPOOLED?.trim() || "",
    username: process.env.FUEL_LOGIN_USERNAME?.trim() || "",
    passwordHash: await legacyPasswordHash(process.env.FUEL_LOGIN_PASSWORD),
    timeZone: zone && isBusinessTimeZone(zone) ? zone : defaultSystemSettings.timeZone,
    baselineSamples: Number.isInteger(samples) && samples >= 2 && samples <= 100
      ? samples : defaultSystemSettings.baselineSamples,
    anomalyMultiplier: Number.isFinite(multiplier) && multiplier >= 1 && multiplier <= 100
      ? multiplier : defaultSystemSettings.anomalyMultiplier,
  };
}

async function loadSnapshot() {
  const saved = await readStoredSettings();
  return saved ?? { settings: await readLegacySettings(), revision: null };
}

const readPageSnapshot = cache(loadSnapshot);
const requestSettings = new AsyncLocalStorage<{ snapshot?: ReturnType<typeof loadSnapshot> }>();

export function withSystemSettings<T>(action: () => Promise<T>) {
  return requestSettings.getStore() ? action() : requestSettings.run({}, action);
}

export function getSystemSettingsSnapshot() {
  const current = requestSettings.getStore();
  return current ? (current.snapshot ??= readPageSnapshot()) : readPageSnapshot();
}

export async function getSystemSettings() {
  return (await getSystemSettingsSnapshot()).settings;
}
