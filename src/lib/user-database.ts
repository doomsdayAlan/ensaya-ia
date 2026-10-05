/**
 * Base de cuentas en IndexedDB (motor de base de datos del navegador).
 * La marca visible es Ensaya IA.
 */

import { LEGACY_PBKDF2_ITERATIONS, LEGACY_STORAGE } from "@/lib/legacy-migration";

export type StoredUser = {
  id: string;
  email: string;
  passwordHash: string;
  passwordSalt: string;
  /** PBKDF2 iterations. Ausente = hash legado (LEGACY_PBKDF2_ITERATIONS). */
  passwordIterations?: number;
  displayName: string;
  createdAt: string;
};

/** OWASP recomendado para PBKDF2-SHA256. */
export const PBKDF2_ITERATIONS = 600_000;

export type StoredProfile = {
  user_id: string;
  display_name: string;
  email: string;
  avatar_url: string | null;
  preferred_voice: string;
  rehearsal_mode: string;
  ai_difficulty: number;
  suggest_emotions: number;
  allow_improv: number;
  feedback_enabled: number;
  notifications_enabled: number;
  offline_mode_enabled: number;
  privacy_level: string;
  created_at: string;
  updated_at: string;
};

const DB_NAME = "ensaya-ia-db";
const DB_VERSION = 1;

async function copyLegacyDbIfNeeded() {
  if (typeof indexedDB === "undefined") return;
  const exists = await new Promise<boolean>((resolve) => {
    const check = indexedDB.open(DB_NAME);
    check.onsuccess = () => {
      const db = check.result;
      const hasStores = db.objectStoreNames.contains("users");
      db.close();
      resolve(hasStores);
    };
    check.onerror = () => resolve(false);
  });
  if (exists) return;

  await new Promise<void>((resolve) => {
    const legacy = indexedDB.open(LEGACY_STORAGE.idbName);
    legacy.onerror = () => resolve();
    legacy.onsuccess = async () => {
      const oldDb = legacy.result;
      if (!oldDb.objectStoreNames.contains("users")) {
        oldDb.close();
        resolve();
        return;
      }
      try {
        const users = await new Promise<unknown[]>((res, rej) => {
          const req = oldDb.transaction("users", "readonly").objectStore("users").getAll();
          req.onsuccess = () => res(req.result ?? []);
          req.onerror = () => rej(req.error);
        });
        const profiles = oldDb.objectStoreNames.contains("perfil_usuario")
          ? await new Promise<unknown[]>((res, rej) => {
              const req = oldDb.transaction("perfil_usuario", "readonly").objectStore("perfil_usuario").getAll();
              req.onsuccess = () => res(req.result ?? []);
              req.onerror = () => rej(req.error);
            })
          : [];
        oldDb.close();
        const next = indexedDB.open(DB_NAME, DB_VERSION);
        next.onupgradeneeded = () => {
          const db = next.result;
          if (!db.objectStoreNames.contains("users")) {
            const store = db.createObjectStore("users", { keyPath: "id" });
            store.createIndex("email", "email", { unique: true });
          }
          if (!db.objectStoreNames.contains("perfil_usuario")) {
            db.createObjectStore("perfil_usuario", { keyPath: "user_id" });
          }
        };
        next.onsuccess = () => {
          const db = next.result;
          const tx = db.transaction(["users", "perfil_usuario"], "readwrite");
          const userStore = tx.objectStore("users");
          const profileStore = tx.objectStore("perfil_usuario");
          for (const user of users) userStore.put(user);
          for (const profile of profiles) profileStore.put(profile);
          tx.oncomplete = () => {
            db.close();
            resolve();
          };
          tx.onerror = () => {
            db.close();
            resolve();
          };
        };
        next.onerror = () => resolve();
      } catch {
        oldDb.close();
        resolve();
      }
    };
  });
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("Este navegador no tiene base de datos IndexedDB."));
      return;
    }
    void copyLegacyDbIfNeeded().finally(() => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains("users")) {
          const users = db.createObjectStore("users", { keyPath: "id" });
          users.createIndex("email", "email", { unique: true });
        }
        if (!db.objectStoreNames.contains("perfil_usuario")) {
          db.createObjectStore("perfil_usuario", { keyPath: "user_id" });
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error ?? new Error("No se pudo abrir la base de datos."));
    });
  });
}

function requestToPromise<T>(request: IDBRequest<T>) {
  return new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Fallo en la base de datos."));
  });
}

function bytesToHex(bytes: ArrayBuffer) {
  return [...new Uint8Array(bytes)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function hashPassword(password: string, salt: string, iterations: number) {
  const encoded = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", encoded.encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt: encoded.encode(salt), iterations },
    key,
    256,
  );
  return bytesToHex(bits);
}

function iterationsFor(user: StoredUser) {
  return user.passwordIterations ?? LEGACY_PBKDF2_ITERATIONS;
}

export async function hashNewPassword(password: string) {
  const salt = bytesToHex(crypto.getRandomValues(new Uint8Array(16)).buffer);
  const passwordHash = await hashPassword(password, salt, PBKDF2_ITERATIONS);
  return { passwordHash, passwordSalt: salt, passwordIterations: PBKDF2_ITERATIONS };
}

export async function passwordMatches(user: StoredUser, password: string) {
  const actual = await hashPassword(password, user.passwordSalt, iterationsFor(user));
  return actual === user.passwordHash;
}

/** Si el hash usa el conteo legado, lo reescribe a 600_000 tras un login correcto. */
export async function upgradePasswordHashIfNeeded(user: StoredUser, password: string) {
  if (iterationsFor(user) >= PBKDF2_ITERATIONS) return user;
  const next = { ...user, ...(await hashNewPassword(password)) };
  await updateUser(next);
  return next;
}

export async function findUserByEmail(email: string) {
  const db = await openDb();
  try {
    const index = db.transaction("users", "readonly").objectStore("users").index("email");
    return await requestToPromise<StoredUser | undefined>(index.get(email));
  } finally {
    db.close();
  }
}

export async function insertUser(user: StoredUser) {
  const db = await openDb();
  try {
    await requestToPromise(db.transaction("users", "readwrite").objectStore("users").add(user));
  } finally {
    db.close();
  }
}

export async function updateUser(user: StoredUser) {
  const db = await openDb();
  try {
    await requestToPromise(db.transaction("users", "readwrite").objectStore("users").put(user));
  } finally {
    db.close();
  }
}

export async function upsertProfile(profile: StoredProfile) {
  const db = await openDb();
  try {
    await requestToPromise(db.transaction("perfil_usuario", "readwrite").objectStore("perfil_usuario").put(profile));
  } finally {
    db.close();
  }
}

export async function getProfile(userId: string) {
  const db = await openDb();
  try {
    return await requestToPromise<StoredProfile | undefined>(
      db.transaction("perfil_usuario", "readonly").objectStore("perfil_usuario").get(userId),
    );
  } finally {
    db.close();
  }
}

export async function countUsers() {
  const db = await openDb();
  try {
    return await requestToPromise(db.transaction("users", "readonly").objectStore("users").count());
  } finally {
    db.close();
  }
}

export function defaultStoredProfile(user: Pick<StoredUser, "id" | "email" | "displayName" | "createdAt">): StoredProfile {
  return {
    user_id: user.id,
    display_name: user.displayName,
    email: user.email,
    avatar_url: null,
    preferred_voice: "Sofia (Femenina)",
    rehearsal_mode: "individual",
    ai_difficulty: 50,
    suggest_emotions: 1,
    allow_improv: 1,
    feedback_enabled: 1,
    notifications_enabled: 1,
    offline_mode_enabled: 1,
    privacy_level: "privado",
    created_at: user.createdAt,
    updated_at: user.createdAt,
  };
}
