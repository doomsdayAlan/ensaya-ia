/** Helpers de entorno web. Evitan repetir guards de window y JSON en cada modulo. */

export function canUseBrowserStorage() {
  return typeof window !== "undefined";
}

export function readJson<T>(storage: Storage, key: string, fallback: T, legacyKeys: string[] = []): T {
  if (!canUseBrowserStorage()) return fallback;
  try {
    const raw = storage.getItem(key) ?? legacyKeys.map((item) => storage.getItem(item)).find(Boolean) ?? null;
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as T;
    if (!storage.getItem(key) && legacyKeys.some((item) => storage.getItem(item))) {
      storage.setItem(key, raw);
    }
    return parsed;
  } catch {
    return fallback;
  }
}

function isQuotaExceeded(error: unknown) {
  if (error instanceof DOMException && error.name === "QuotaExceededError") return true;
  if (error instanceof Error && /quota/i.test(error.message)) return true;
  return false;
}

const QUOTA_MESSAGE =
  "No hay espacio suficiente en este navegador para guardar mas datos. Borra ensayos, grabaciones o libretos viejos, o libera el almacenamiento del sitio.";

export function writeJson(storage: Storage, key: string, value: unknown) {
  if (!canUseBrowserStorage()) return;
  try {
    storage.setItem(key, JSON.stringify(value));
  } catch (error) {
    if (isQuotaExceeded(error)) {
      // Aviso claro al usuario (sonner si esta montado).
      try {
        void import("sonner").then(({ toast }) => toast.error(QUOTA_MESSAGE));
      } catch {
        // sin UI de toast
      }
      throw new Error(QUOTA_MESSAGE);
    }
    throw error;
  }
}

export function removeKey(storage: Storage, key: string) {
  if (!canUseBrowserStorage()) return;
  storage.removeItem(key);
}

export function withTimeout<T>(promise: Promise<T>, ms = 800): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("timeout")), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

export function uniqueById<T extends { id: string }>(items: T[]) {
  const byId = new Map<string, T>();
  items.forEach((item) => byId.set(item.id, item));
  return Array.from(byId.values());
}
