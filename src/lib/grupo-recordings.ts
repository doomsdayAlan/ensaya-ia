/**
 * Grabaciones de grupo en IndexedDB (audio por linea del libreto).
 * Sustituye el stub getGrabacionesGrupo del incremento 4 sin depender de Supabase.
 */

const DB_NAME = "ensaya-ia-grabaciones";
const STORE = "grabaciones";
const DB_VERSION = 1;

export type StoredGrupoGrabacion = {
  id: string;
  grupoId: string;
  scriptId: string;
  lineId: string;
  characterId: string | null;
  characterName: string;
  userId: string;
  mimeType: string;
  blob: Blob;
  createdAt: string;
  durationSec: number | null;
};

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("Este navegador no soporta IndexedDB."));
      return;
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { keyPath: "id" });
        store.createIndex("scriptId", "scriptId", { unique: false });
        store.createIndex("grupoId", "grupoId", { unique: false });
        store.createIndex("scriptLine", ["scriptId", "lineId"], { unique: true });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("No se pudo abrir grabaciones."));
  });
}

function requestToPromise<T>(request: IDBRequest<T>) {
  return new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Fallo en IndexedDB."));
  });
}

export async function upsertGrupoGrabacion(
  input: Omit<StoredGrupoGrabacion, "id" | "createdAt"> & { id?: string; createdAt?: string },
): Promise<StoredGrupoGrabacion> {
  const db = await openDb();
  try {
    const tx = db.transaction(STORE, "readwrite");
    const store = tx.objectStore(STORE);
    const index = store.index("scriptLine");
    const existing = await requestToPromise<StoredGrupoGrabacion | undefined>(
      index.get([input.scriptId, input.lineId]),
    );
    const row: StoredGrupoGrabacion = {
      id: existing?.id ?? input.id ?? `grab-${crypto.randomUUID()}`,
      grupoId: input.grupoId,
      scriptId: input.scriptId,
      lineId: input.lineId,
      characterId: input.characterId,
      characterName: input.characterName,
      userId: input.userId,
      mimeType: input.mimeType,
      blob: input.blob,
      createdAt: input.createdAt ?? new Date().toISOString(),
      durationSec: input.durationSec,
    };
    await requestToPromise(store.put(row));
    return row;
  } finally {
    db.close();
  }
}

export async function listGrabacionesByScript(scriptId: string): Promise<StoredGrupoGrabacion[]> {
  const db = await openDb();
  try {
    const index = db.transaction(STORE, "readonly").objectStore(STORE).index("scriptId");
    return await requestToPromise(index.getAll(scriptId));
  } finally {
    db.close();
  }
}

export async function listGrabacionesByGrupo(grupoId: string): Promise<StoredGrupoGrabacion[]> {
  const db = await openDb();
  try {
    const index = db.transaction(STORE, "readonly").objectStore(STORE).index("grupoId");
    const rows = await requestToPromise(index.getAll(grupoId));
    return rows.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  } finally {
    db.close();
  }
}

export async function deleteGrabacionById(id: string) {
  const db = await openDb();
  try {
    await requestToPromise(db.transaction(STORE, "readwrite").objectStore(STORE).delete(id));
  } finally {
    db.close();
  }
}

export async function deleteGrabacionesByGrupo(grupoId: string) {
  const rows = await listGrabacionesByGrupo(grupoId);
  const db = await openDb();
  try {
    const store = db.transaction(STORE, "readwrite").objectStore(STORE);
    await Promise.all(rows.map((row) => requestToPromise(store.delete(row.id))));
  } finally {
    db.close();
  }
}

export async function deleteGrabacionesByScript(scriptId: string) {
  const rows = await listGrabacionesByScript(scriptId);
  const db = await openDb();
  try {
    const store = db.transaction(STORE, "readwrite").objectStore(STORE);
    await Promise.all(rows.map((row) => requestToPromise(store.delete(row.id))));
  } finally {
    db.close();
  }
}

/** Mapa lineId → object URL listo para <audio> / new Audio(). */
export async function grabacionesMapForScript(scriptId: string): Promise<Record<string, string>> {
  const rows = await listGrabacionesByScript(scriptId);
  const urls: Record<string, string> = {};
  for (const row of rows) {
    if (row.blob && row.lineId) {
      urls[row.lineId] = URL.createObjectURL(row.blob);
    }
  }
  return urls;
}

export function blobFromObjectUrl(url: string): Promise<Blob> {
  return fetch(url).then((res) => res.blob());
}
