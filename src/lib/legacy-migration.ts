/**
 * Claves de almacenamiento heredadas (solo migracion de datos antiguos).
 * Mantener aqui para no esparcir el prefijo anterior por el codigo.
 * El producto es Ensaya IA; estas claves no son marca visible.
 */

export const LEGACY_STORAGE = {
  users: "cine-estrella-users",
  session: "cine-estrella-session",
  profiles: "cine-estrella-profiles",
  idbMigrated: "cine-estrella-idb-migrated",
  library: "cine-estrella-library",
  grupos: "cine-estrella-grupos",
  activeRehearsal: "cine-estrella-active-rehearsal",
  lastReport: "cine-estrella-last-report",
  rehearsalHistory: "cine-estrella-rehearsal-history",
  requireAuth: "cine-estrella-require-auth",
  postLogin: "cine-estrella-post-login",
  /** Nombre de IndexedDB antigua (cuentas). */
  idbName: "cine-estrella-db",
} as const;

/** Correos de cuentas demo anteriores (migrar a DEMO_ACCOUNT.email). */
export const LEGACY_DEMO_EMAILS = [
  "demo@ensayaia.local",
  "demo@cineestrella.local",
] as const;

/** Iteraciones PBKDF2 usadas en hashes antiguos (antes del valor OWASP actual). */
export const LEGACY_PBKDF2_ITERATIONS = 12_000;
