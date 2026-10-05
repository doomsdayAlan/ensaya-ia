/**
 * Grabaciones de grupo en IndexedDB (audio por linea del libreto).
 * Una toma por (grupo, script, linea, usuario).
 */

const DB_NAME = "ensaya-ia-grabaciones";
const STORE = "grabaciones";
/** v2: clave unica por grupo+script+linea+usuario; indice sceneId. */
const DB_VERSION = 2;

export type StoredGrupoGrabacion = {
  id: string;
  grupoId: string;
  scriptId: string;
  sceneId: string | null;
  sceneTitle: string | null;
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
    request.onupgradeneeded = (event) => {
      const db = request.result;
      const oldVersion = event.oldVersion;
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { keyPath: "id" });
        store.createIndex("scriptId", "scriptId", { unique: false });
        store.createIndex("grupoId", "grupoId", { unique: false });
        store.createIndex("sceneId", "sceneId", { unique: false });
        store.createIndex("takeKey", ["grupoId", "scriptId", "lineId", "userId"], { unique: true });
        return;
      }
      const tx = request.transaction;
      if (!tx) return;
      const store = tx.objectStore(STORE);
      if (oldVersion < 2) {
        if (store.indexNames.contains("scriptLine")) {
          store.deleteIndex("scriptLine");
        }
        if (!store.indexNames.contains("sceneId")) {
          store.createIndex("sceneId", "sceneId", { unique: false });
        }
        if (!store.indexNames.contains("takeKey")) {
          store.createIndex("takeKey", ["grupoId", "scriptId", "lineId", "userId"], { unique: true });
        }
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
    const index = store.index("takeKey");
    let existing: StoredGrupoGrabacion | undefined;
    try {
      existing = await requestToPromise<StoredGrupoGrabacion | undefined>(
        index.get([input.grupoId, input.scriptId, input.lineId, input.userId]),
      );
    } catch {
      existing = undefined;
    }
    const row: StoredGrupoGrabacion = {
      id: existing?.id ?? input.id ?? `grab-${crypto.randomUUID()}`,
      grupoId: input.grupoId,
      scriptId: input.scriptId,
      sceneId: input.sceneId ?? existing?.sceneId ?? null,
      sceneTitle: input.sceneTitle ?? existing?.sceneTitle ?? null,
      lineId: input.lineId,
      characterId: input.characterId,
      characterName: input.characterName,
      userId: input.userId,
      mimeType: input.mimeType,
      blob: input.blob,
      createdAt: input.createdAt ?? new Date().toISOString(),
      durationSec: input.durationSec,
    };
    try {
      await requestToPromise(store.put(row));
    } catch (error) {
      const name = error instanceof DOMException ? error.name : "";
      if (name === "QuotaExceededError" || (error instanceof Error && /quota/i.test(error.message))) {
        throw new Error(
          "No hay espacio suficiente en este navegador para guardar el audio. Borra grabaciones viejas o libera almacenamiento del sitio.",
        );
      }
      throw error;
    }
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

/**
 * Preferencia de reproduccion en ensayo: si hay varias tomas de la misma linea,
 * prioriza la mas reciente (cualquier miembro).
 */
export async function grabacionesMapForScript(
  scriptId: string,
  grupoId?: string | null,
): Promise<Record<string, string>> {
  let rows = await listGrabacionesByScript(scriptId);
  if (grupoId) rows = rows.filter((row) => row.grupoId === grupoId);
  rows.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const urls: Record<string, string> = {};
  for (const row of rows) {
    if (row.blob && row.lineId) {
      if (urls[row.lineId]) URL.revokeObjectURL(urls[row.lineId]);
      urls[row.lineId] = URL.createObjectURL(row.blob);
    }
  }
  return urls;
}

export function blobFromObjectUrl(url: string): Promise<Blob> {
  return fetch(url).then((res) => res.blob());
}
