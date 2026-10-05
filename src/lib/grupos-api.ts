/**
 * Grupos locales (misma UI que Ia_ensayosforked).
 * En este dispositivo viven en localStorage; no dependen del Supabase caido.
 */
import { getCurrentUserId, getScriptDetails, type ScriptDetails } from "@/lib/rehearsal-data";
import { getLocalAuthUser, loadLocalProfile } from "@/lib/local-auth";
import { listLocalScripts } from "@/lib/local-library";
import { canUseBrowserStorage, readJson, writeJson } from "@/lib/browser";
import {
  deleteGrabacionById,
  deleteGrabacionesByGrupo,
  deleteGrabacionesByScript,
  grabacionesMapForScript,
  listGrabacionesByGrupo,
  upsertGrupoGrabacion,
  type StoredGrupoGrabacion,
} from "@/lib/grupo-recordings";
import type { Tables } from "@/integrations/supabase/types";

export type GrupoRecord = {
  id: string;
  nombre: string;
  creado_por: string;
  max_miembros: number;
  codigo_invitacion: string;
  created_at: string;
};

export type GrupoMiembroRecord = {
  id: string;
  grupo_id: string;
  user_id: string;
  rol: "admin" | "miembro";
  personaje_id: string | null;
  joined_at: string;
};

export type GrupoLibretoRecord = {
  id: string;
  grupo_id: string;
  script_id: string;
  added_at: string;
};

export type GrupoAnuncioRecord = {
  id: string;
  grupo_id: string;
  user_id: string;
  contenido: string;
  created_at: string;
};

export type GrupoConRol = GrupoRecord & { miRol: "admin" | "miembro" };

export type MiembroConPerfil = GrupoMiembroRecord & {
  perfil: {
    id_usuario: string;
    nombre_usuario: string | null;
    display_name: string | null;
    email: string | null;
  } | null;
};

export type LibretoDelGrupo = GrupoLibretoRecord & {
  script: { id: string; title: string; author: string | null } | null;
};

export type AnuncioConAutor = GrupoAnuncioRecord & {
  perfil: {
    id_usuario: string;
    nombre_usuario: string | null;
    display_name: string | null;
  } | null;
};

export type GrupoDetalle = {
  grupo: GrupoRecord;
  miRol: "admin" | "miembro";
  miembros: MiembroConPerfil[];
  libretos: LibretoDelGrupo[];
  characters: Tables<"characters">[];
  anuncios: AnuncioConAutor[];
};

type Store = {
  grupos: GrupoRecord[];
  miembros: GrupoMiembroRecord[];
  libretos: GrupoLibretoRecord[];
  anuncios: GrupoAnuncioRecord[];
};

const STORE_KEY = "ensaya-ia-grupos";
const LEGACY_STORE_KEY = "cine-estrella-grupos";
const CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function emptyStore(): Store {
  return { grupos: [], miembros: [], libretos: [], anuncios: [] };
}

function readStore(): Store {
  return readJson<Store>(localStorage, STORE_KEY, emptyStore(), [LEGACY_STORE_KEY]);
}

function writeStore(store: Store) {
  writeJson(localStorage, STORE_KEY, store);
}

function generarCodigo(): string {
  return Array.from({ length: 10 }, () => CHARS[Math.floor(Math.random() * CHARS.length)]).join("");
}

function perfilDe(userId: string) {
  const local = loadLocalProfile(userId);
  const session = getLocalAuthUser();
  const email = local?.email ?? (session?.id === userId ? session.email : null);
  const display = local?.display_name ?? (session?.id === userId ? session.user_metadata.display_name : null);
  return {
    id_usuario: userId,
    nombre_usuario: display,
    display_name: display,
    email,
  };
}

export async function crearGrupo(nombre: string, maxMiembros: number, codigoPersonalizado?: string) {
  const userId = await getCurrentUserId();
  if (!userId) throw new Error("Debes iniciar sesion para crear un grupo.");
  if (!canUseBrowserStorage()) throw new Error("No hay almacenamiento en este navegador.");

  const codigo = codigoPersonalizado?.trim().toUpperCase() || generarCodigo();
  const store = readStore();
  if (store.grupos.some((grupo) => grupo.codigo_invitacion === codigo)) {
    throw new Error("Ese codigo de invitacion ya existe. Usa otro.");
  }

  const now = new Date().toISOString();
  const grupo: GrupoRecord = {
    id: crypto.randomUUID(),
    nombre: nombre.trim(),
    creado_por: userId,
    max_miembros: maxMiembros,
    codigo_invitacion: codigo,
    created_at: now,
  };
  store.grupos.push(grupo);
  store.miembros.push({
    id: crypto.randomUUID(),
    grupo_id: grupo.id,
    user_id: userId,
    rol: "admin",
    personaje_id: null,
    joined_at: now,
  });
  writeStore(store);
  return grupo;
}

export async function unirseAGrupo(codigo: string) {
  const userId = await getCurrentUserId();
  if (!userId) throw new Error("Debes iniciar sesion para unirte a un grupo.");

  const store = readStore();
  const grupo = store.grupos.find((item) => item.codigo_invitacion === codigo.trim().toUpperCase());
  if (!grupo) throw new Error("Codigo incorrecto o grupo no encontrado.");

  const total = store.miembros.filter((item) => item.grupo_id === grupo.id).length;
  if (total >= grupo.max_miembros) throw new Error("El grupo ya esta lleno.");
  if (store.miembros.some((item) => item.grupo_id === grupo.id && item.user_id === userId)) {
    throw new Error("Ya eres miembro de este grupo.");
  }

  store.miembros.push({
    id: crypto.randomUUID(),
    grupo_id: grupo.id,
    user_id: userId,
    rol: "miembro",
    personaje_id: null,
    joined_at: new Date().toISOString(),
  });
  writeStore(store);
  return grupo;
}

export async function getMisGrupos(): Promise<GrupoConRol[]> {
  const userId = await getCurrentUserId();
  if (!userId) return [];
  const store = readStore();
  return store.miembros
    .filter((item) => item.user_id === userId)
    .map((item) => {
      const grupo = store.grupos.find((row) => row.id === item.grupo_id);
      if (!grupo) return null;
      return { ...grupo, miRol: item.rol };
    })
    .filter((item): item is GrupoConRol => Boolean(item));
}

export async function getGrupoDetalle(grupoId: string): Promise<GrupoDetalle> {
  const userId = await getCurrentUserId();
  if (!userId) throw new Error("No autenticado.");
  const store = readStore();
  const grupo = store.grupos.find((item) => item.id === grupoId);
  if (!grupo) throw new Error("Grupo no encontrado.");

  const miembrosRaw = store.miembros.filter((item) => item.grupo_id === grupoId);
  const me = miembrosRaw.find((item) => item.user_id === userId);
  if (!me) throw new Error("No eres miembro de este grupo.");

  const libretosRaw = store.libretos.filter((item) => item.grupo_id === grupoId);
  const scripts = listLocalScripts(true);
  const characters: Tables<"characters">[] = [];
  for (const lib of libretosRaw) {
    const details = await getScriptDetails(lib.script_id).catch(() => null);
    if (details?.characters) characters.push(...details.characters);
  }

  const anuncios = store.anuncios
    .filter((item) => item.grupo_id === grupoId)
    .sort((a, b) => b.created_at.localeCompare(a.created_at));

  const miembros: MiembroConPerfil[] = miembrosRaw.map((item) => ({
    ...item,
    perfil: perfilDe(item.user_id),
  }));

  return {
    grupo,
    miRol: me.rol,
    miembros,
    libretos: libretosRaw.map((item) => {
      const script = scripts.find((row) => row.id === item.script_id);
      return {
        ...item,
        script: script ? { id: script.id, title: script.title, author: script.author } : null,
      };
    }),
    characters,
    anuncios: anuncios.map((item) => ({
      ...item,
      perfil: perfilDe(item.user_id),
    })),
  };
}

export async function eliminarGrupo(grupoId: string) {
  const store = readStore();
  writeStore({
    grupos: store.grupos.filter((item) => item.id !== grupoId),
    miembros: store.miembros.filter((item) => item.grupo_id !== grupoId),
    libretos: store.libretos.filter((item) => item.grupo_id !== grupoId),
    anuncios: store.anuncios.filter((item) => item.grupo_id !== grupoId),
  });
  await deleteGrabacionesByGrupo(grupoId).catch(() => undefined);
}

export async function salirDeGrupo(grupoId: string) {
  const userId = await getCurrentUserId();
  if (!userId) throw new Error("No autenticado.");
  const store = readStore();
  store.miembros = store.miembros.filter((item) => !(item.grupo_id === grupoId && item.user_id === userId));
  writeStore(store);
}

export async function eliminarMiembro(grupoId: string, miembroUserId: string) {
  const store = readStore();
  store.miembros = store.miembros.filter((item) => !(item.grupo_id === grupoId && item.user_id === miembroUserId));
  writeStore(store);
}

export async function asignarPersonaje(grupoId: string, miembroUserId: string, personajeId: string | null) {
  const store = readStore();
  const miembro = store.miembros.find((item) => item.grupo_id === grupoId && item.user_id === miembroUserId);
  if (!miembro) throw new Error("Miembro no encontrado.");
  miembro.personaje_id = personajeId;
  writeStore(store);
}

export async function addLibretoAlGrupo(grupoId: string, scriptId: string) {
  const store = readStore();
  if (store.libretos.some((item) => item.grupo_id === grupoId && item.script_id === scriptId)) {
    throw new Error("Ese libreto ya esta en el grupo.");
  }
  store.libretos.push({
    id: crypto.randomUUID(),
    grupo_id: grupoId,
    script_id: scriptId,
    added_at: new Date().toISOString(),
  });
  writeStore(store);
}

export async function reemplazarLibreto(grupoId: string, scriptId: string) {
  const store = readStore();
  const previous = store.libretos.filter((item) => item.grupo_id === grupoId).map((item) => item.script_id);
  store.libretos = store.libretos.filter((item) => item.grupo_id !== grupoId);
  store.miembros = store.miembros.map((item) =>
    item.grupo_id === grupoId ? { ...item, personaje_id: null } : item,
  );
  store.libretos.push({
    id: crypto.randomUUID(),
    grupo_id: grupoId,
    script_id: scriptId,
    added_at: new Date().toISOString(),
  });
  writeStore(store);
  await Promise.all(
    previous
      .filter((id) => id !== scriptId)
      .map((id) => deleteGrabacionesByScript(id).catch(() => undefined)),
  );
}

export async function removeLibretoDelGrupo(grupoId: string, scriptId: string) {
  const store = readStore();
  store.libretos = store.libretos.filter((item) => !(item.grupo_id === grupoId && item.script_id === scriptId));
  writeStore(store);
  await deleteGrabacionesByScript(scriptId).catch(() => undefined);
}

export async function publicarAnuncio(grupoId: string, contenido: string) {
  const userId = await getCurrentUserId();
  if (!userId) throw new Error("No autenticado.");
  const anuncio: GrupoAnuncioRecord = {
    id: crypto.randomUUID(),
    grupo_id: grupoId,
    user_id: userId,
    contenido: contenido.trim(),
    created_at: new Date().toISOString(),
  };
  const store = readStore();
  store.anuncios.unshift(anuncio);
  writeStore(store);
  return anuncio;
}

export async function eliminarAnuncio(anuncioId: string) {
  const store = readStore();
  store.anuncios = store.anuncios.filter((item) => item.id !== anuncioId);
  writeStore(store);
}

export function nombreMiembro(perfil: MiembroConPerfil["perfil"]): string {
  return perfil?.display_name || perfil?.nombre_usuario || perfil?.email || "Usuario";
}

export function formatGrupoDate(iso: string): string {
  return new Date(iso).toLocaleDateString("es", { day: "numeric", month: "short", year: "numeric" });
}

export type GrupoAsignacion = { userId: string; displayName: string };

export type GrupoParaScript = {
  grupoId: string;
  personajeId: string | null;
  rol: "admin" | "miembro";
  asignaciones: Record<string, GrupoAsignacion>;
};

export async function getGrupoParaScript(scriptId: string): Promise<GrupoParaScript | null> {
  const userId = await getCurrentUserId();
  if (!userId) return null;
  const store = readStore();
  const lib = store.libretos.find((item) => item.script_id === scriptId);
  if (!lib) return null;
  const me = store.miembros.find((item) => item.grupo_id === lib.grupo_id && item.user_id === userId);
  if (!me) return null;
  const asignaciones: Record<string, GrupoAsignacion> = {};
  for (const miembro of store.miembros.filter((item) => item.grupo_id === lib.grupo_id)) {
    if (!miembro.personaje_id) continue;
    const perfil = perfilDe(miembro.user_id);
    asignaciones[miembro.personaje_id] = {
      userId: miembro.user_id,
      displayName: nombreMiembro(perfil),
    };
  }
  return { grupoId: lib.grupo_id, personajeId: me.personaje_id, rol: me.rol, asignaciones };
}

export async function getScriptDetailsForGrupo(scriptId: string, _grupoId: string): Promise<ScriptDetails> {
  return getScriptDetails(scriptId);
}

export type GrupoGrabacionMeta = {
  id: string;
  grupoId: string;
  scriptId: string;
  lineId: string;
  characterId: string | null;
  characterName: string;
  userId: string;
  actorName: string;
  createdAt: string;
  durationSec: number | null;
  audioUrl: string;
};

/** Mapa { [lineId]: audioUrl } para reproducir lineas de otros actores en el ensayo. */
export async function getGrabacionesGrupo(scriptId: string): Promise<Record<string, string>> {
  try {
    return await grabacionesMapForScript(scriptId);
  } catch {
    return {};
  }
}

export async function listGrabacionesGrupo(grupoId: string): Promise<GrupoGrabacionMeta[]> {
  const rows = await listGrabacionesByGrupo(grupoId);
  return rows.map((row) => toGrabacionMeta(row));
}

export async function saveGrabacionGrupo(input: {
  grupoId: string;
  scriptId: string;
  lineId: string;
  characterId: string | null;
  characterName: string;
  blob: Blob;
  durationSec?: number | null;
}): Promise<GrupoGrabacionMeta> {
  const userId = await getCurrentUserId();
  if (!userId) throw new Error("Debes iniciar sesion para guardar la grabacion.");
  if (!input.blob.size) throw new Error("La grabacion esta vacia.");

  const row = await upsertGrupoGrabacion({
    grupoId: input.grupoId,
    scriptId: input.scriptId,
    lineId: input.lineId,
    characterId: input.characterId,
    characterName: input.characterName,
    userId,
    mimeType: input.blob.type || "audio/webm",
    blob: input.blob,
    durationSec: input.durationSec ?? null,
  });
  return toGrabacionMeta(row);
}

export async function eliminarGrabacionGrupo(grabacionId: string) {
  await deleteGrabacionById(grabacionId);
}

function toGrabacionMeta(row: StoredGrupoGrabacion): GrupoGrabacionMeta {
  return {
    id: row.id,
    grupoId: row.grupoId,
    scriptId: row.scriptId,
    lineId: row.lineId,
    characterId: row.characterId,
    characterName: row.characterName,
    userId: row.userId,
    actorName: nombreMiembro(perfilDe(row.userId)),
    createdAt: row.createdAt,
    durationSec: row.durationSec,
    audioUrl: URL.createObjectURL(row.blob),
  };
}
