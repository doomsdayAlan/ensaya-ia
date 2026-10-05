/**
 * Sesion en localStorage; cuentas y perfil en IndexedDB (ver user-database.ts).
 */
import type { PerfilUsuarioRecord } from "@/lib/rehearsal-data";
import { getDemoScriptSetup } from "@/lib/demo-script";
import { duplicateLocalSetup, listLocalScripts } from "@/lib/local-library";
import { canUseBrowserStorage, readJson, removeKey, writeJson } from "@/lib/browser";
import { LEGACY_DEMO_EMAILS, LEGACY_STORAGE } from "@/lib/legacy-migration";
import {
  countUsers,
  defaultStoredProfile,
  findUserByEmail,
  getProfile,
  hashNewPassword,
  insertUser,
  passwordMatches,
  updateUser,
  upgradePasswordHashIfNeeded,
  upsertProfile,
  type StoredProfile,
} from "@/lib/user-database";

const USERS_KEY = "ensaya-ia-users";
const SESSION_KEY = "ensaya-ia-session";
const PROFILE_KEY = "ensaya-ia-profiles";
const AUTH_EVENT = "ensaya-ia-auth";
const MIGRATED_KEY = "ensaya-ia-idb-migrated";

export const DEMO_ACCOUNT = {
  email: "demo@ensaya-ia.local",
  password: "ensayo123",
  displayName: "Cuenta demo",
} as const;

export function isDemoEmail(email: string) {
  const normalized = email.trim().toLowerCase();
  return (
    normalized === DEMO_ACCOUNT.email ||
    (LEGACY_DEMO_EMAILS as readonly string[]).includes(normalized)
  );
}

export type LocalAccount = {
  id: string;
  email: string;
  password: string;
  displayName: string;
  createdAt: string;
};

export type LocalAuthUser = {
  id: string;
  email: string;
  user_metadata: {
    display_name: string;
    full_name: string;
    name: string;
  };
};

type SessionRecord = {
  userId: string;
  email: string;
  displayName: string;
};

function emitAuth() {
  if (!canUseBrowserStorage()) return;
  window.dispatchEvent(new Event(AUTH_EVENT));
}

function toAuthUser(session: SessionRecord): LocalAuthUser {
  return {
    id: session.userId,
    email: session.email,
    user_metadata: {
      display_name: session.displayName,
      full_name: session.displayName,
      name: session.displayName,
    },
  };
}

function persistSession(session: SessionRecord) {
  writeJson(localStorage, SESSION_KEY, session);
  emitAuth();
}

export function getLocalAuthUser(): LocalAuthUser | null {
  const session = readJson<SessionRecord | null>(localStorage, SESSION_KEY, null, [LEGACY_STORAGE.session]);
  if (!session?.userId || !session.email) return null;
  return toAuthUser(session);
}

export function isLocalUserId(id: string | null | undefined) {
  return Boolean(id?.startsWith("local-"));
}

function profileFromStored(row: StoredProfile): PerfilUsuarioRecord {
  return {
    user_id: row.user_id,
    display_name: row.display_name,
    email: row.email,
    avatar_url: row.avatar_url,
    preferred_voice: row.preferred_voice,
    rehearsal_mode: row.rehearsal_mode,
    ai_difficulty: row.ai_difficulty,
    suggest_emotions: Boolean(row.suggest_emotions),
    allow_improv: Boolean(row.allow_improv),
    feedback_enabled: Boolean(row.feedback_enabled),
    notifications_enabled: Boolean(row.notifications_enabled),
    offline_mode_enabled: Boolean(row.offline_mode_enabled),
    privacy_level: row.privacy_level,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function storedFromProfile(profile: PerfilUsuarioRecord): StoredProfile {
  return {
    user_id: profile.user_id,
    display_name: profile.display_name ?? "",
    email: profile.email ?? "",
    avatar_url: profile.avatar_url,
    preferred_voice: profile.preferred_voice,
    rehearsal_mode: profile.rehearsal_mode,
    ai_difficulty: profile.ai_difficulty,
    suggest_emotions: profile.suggest_emotions ? 1 : 0,
    allow_improv: profile.allow_improv ? 1 : 0,
    feedback_enabled: profile.feedback_enabled ? 1 : 0,
    notifications_enabled: profile.notifications_enabled ? 1 : 0,
    offline_mode_enabled: profile.offline_mode_enabled ? 1 : 0,
    privacy_level: profile.privacy_level,
    created_at: profile.created_at,
    updated_at: profile.updated_at,
  };
}

async function scrubPlaintextUserStores() {
  // Nunca deben quedar contraseñas en texto plano en localStorage (claves actuales ni LEGACY_*).
  removeKey(localStorage, USERS_KEY);
  removeKey(localStorage, LEGACY_STORAGE.users);
}

async function migrateLegacyUsers() {
  if (!canUseBrowserStorage()) return;

  const alreadyMigrated =
    localStorage.getItem(MIGRATED_KEY) === "1" || localStorage.getItem(LEGACY_STORAGE.idbMigrated) === "1";

  if (!alreadyMigrated) {
    // Lectura puntual sin re-copiar el blob legado a ensaya-ia-users.
    let legacy: LocalAccount[] = [];
    try {
      const raw =
        localStorage.getItem(USERS_KEY) ?? localStorage.getItem(LEGACY_STORAGE.users) ?? null;
      if (raw) legacy = JSON.parse(raw) as LocalAccount[];
    } catch {
      legacy = [];
    }
    for (const item of legacy) {
      if (!item?.email || !item.password) continue;
      const exists = await findUserByEmail(item.email);
      if (exists) continue;
      const hashed = await hashNewPassword(item.password);
      const createdAt = item.createdAt || new Date().toISOString();
      await insertUser({
        id: item.id || `local-${crypto.randomUUID()}`,
        email: item.email,
        displayName: item.displayName || item.email.split("@")[0] || "Actor",
        createdAt,
        ...hashed,
      });
      const local = loadLocalProfile(item.id);
      await upsertProfile(
        local
          ? storedFromProfile(local)
          : defaultStoredProfile({
              id: item.id,
              email: item.email,
              displayName: item.displayName,
              createdAt,
            }),
      );
    }
    localStorage.setItem(MIGRATED_KEY, "1");
  }

  scrubPlaintextUserStores();
}

export async function ensureLocalAuthReady() {
  await migrateLegacyUsers();
}

export async function registerLocalAccount({
  email,
  password,
  displayName,
}: {
  email: string;
  password: string;
  displayName: string;
}) {
  await migrateLegacyUsers();
  const normalized = email.trim().toLowerCase();
  if (await findUserByEmail(normalized)) {
    throw new Error("Ya existe una cuenta con ese correo.");
  }

  const now = new Date().toISOString();
  const hashed = await hashNewPassword(password);
  const account = {
    id: `local-${crypto.randomUUID()}`,
    email: normalized,
    displayName: displayName.trim() || normalized.split("@")[0] || "Actor",
    createdAt: now,
    ...hashed,
  };

  await insertUser(account);
  const storedProfile = defaultStoredProfile(account);
  await upsertProfile(storedProfile);
  saveLocalProfile(profileFromStored(storedProfile));
  persistSession({
    userId: account.id,
    email: account.email,
    displayName: account.displayName,
  });
  return toAuthUser({
    userId: account.id,
    email: account.email,
    displayName: account.displayName,
  });
}

function persistUserSession(account: { id: string; email: string; displayName: string }) {
  persistSession({
    userId: account.id,
    email: account.email,
    displayName: account.displayName,
  });
  return toAuthUser({
    userId: account.id,
    email: account.email,
    displayName: account.displayName,
  });
}

function seedDemoScripts(userId: string) {
  const owned = listLocalScripts(true).filter((script) => script.user_id === userId);
  if (owned.length === 0) {
    duplicateLocalSetup(getDemoScriptSetup(), userId);
  }
}

/** Crea o repara la cuenta demo para que ensayo123 siempre funcione. */
export async function enterDemoAccount() {
  await migrateLegacyUsers();
  let account = await findUserByEmail(DEMO_ACCOUNT.email);
  if (!account) {
    for (const legacyEmail of LEGACY_DEMO_EMAILS) {
      account = await findUserByEmail(legacyEmail);
      if (account) break;
    }
  }
  const hashed = await hashNewPassword(DEMO_ACCOUNT.password);

  if (!account) {
    const now = new Date().toISOString();
    account = {
      id: `local-${crypto.randomUUID()}`,
      email: DEMO_ACCOUNT.email,
      displayName: DEMO_ACCOUNT.displayName,
      createdAt: now,
      ...hashed,
    };
    await insertUser(account);
    const storedProfile = defaultStoredProfile(account);
    await upsertProfile(storedProfile);
    saveLocalProfile(profileFromStored(storedProfile));
  } else {
    account = {
      ...account,
      ...hashed,
      email: DEMO_ACCOUNT.email,
      displayName: DEMO_ACCOUNT.displayName,
    };
    await updateUser(account);
  }

  seedDemoScripts(account.id);
  return persistUserSession(account);
}

export async function loginLocalAccount({ email, password }: { email: string; password: string }) {
  await migrateLegacyUsers();
  const normalized = email.trim().toLowerCase();

  if (isDemoEmail(normalized) && password === DEMO_ACCOUNT.password) {
    return enterDemoAccount();
  }

  const account = await findUserByEmail(normalized);
  if (!account) {
    throw new Error("No hay una cuenta con ese correo.");
  }
  if (!(await passwordMatches(account, password))) {
    throw new Error("La contraseña no coincide.");
  }
  const upgraded = await upgradePasswordHashIfNeeded(account, password);
  const stored = await getProfile(upgraded.id);
  if (stored) saveLocalProfile(profileFromStored(stored));
  return persistUserSession(upgraded);
}

export function logoutLocalAccount() {
  removeKey(localStorage, SESSION_KEY);
  removeKey(localStorage, LEGACY_STORAGE.session);
  emitAuth();
}

export function subscribeLocalAuth(listener: () => void) {
  if (!canUseBrowserStorage()) return () => undefined;
  window.addEventListener(AUTH_EVENT, listener);
  window.addEventListener("storage", listener);
  return () => {
    window.removeEventListener(AUTH_EVENT, listener);
    window.removeEventListener("storage", listener);
  };
}

function readProfiles() {
  return readJson<Record<string, PerfilUsuarioRecord>>(localStorage, PROFILE_KEY, {}, [LEGACY_STORAGE.profiles]);
}

export function loadLocalProfile(userId: string): PerfilUsuarioRecord | null {
  return readProfiles()[userId] ?? null;
}

export function saveLocalProfile(profile: PerfilUsuarioRecord) {
  if (!canUseBrowserStorage()) return profile;
  const all = readProfiles();
  const saved = { ...profile, updated_at: new Date().toISOString() };
  all[profile.user_id] = saved;
  writeJson(localStorage, PROFILE_KEY, all);
  void upsertProfile(storedFromProfile(saved));
  return saved;
}

export async function getStoredUserCount() {
  try {
    await migrateLegacyUsers();
    return await countUsers();
  } catch {
    return 0;
  }
}
