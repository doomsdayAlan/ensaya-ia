import type { CharacterRecord, ScriptDetails, ScriptImportDraft, ScriptRecord, ScriptSetup } from "@/lib/rehearsal-data";
import { getDemoScriptSetup } from "@/lib/demo-script";
import { readJson, writeJson } from "@/lib/browser";

const LIBRARY_KEY = "ensaya-ia-library";
const LEGACY_LIBRARY_KEY = "cine-estrella-library";

type LocalLibrary = {
  scripts: ScriptRecord[];
  setups: Record<string, ScriptSetup>;
};

function emptyLibrary(): LocalLibrary {
  return { scripts: [], setups: {} };
}

function readLibrary(): LocalLibrary {
  return readJson<LocalLibrary>(localStorage, LIBRARY_KEY, emptyLibrary(), [LEGACY_LIBRARY_KEY]);
}

function writeLibrary(library: LocalLibrary) {
  writeJson(localStorage, LIBRARY_KEY, library);
}

export function listLocalScripts(includeDeleted = false) {
  return readLibrary().scripts.filter((script) => includeDeleted || !script.deleted_at);
}

export function getLocalScriptSetup(scriptId?: string, sceneId?: string): ScriptSetup | null {
  const library = readLibrary();
  const demo = getDemoScriptSetup();
  if (!scriptId || scriptId === demo.script?.id) return demo;
  const setup = library.setups[scriptId];
  if (!setup) return null;
  const scene = setup.scenes.find((item) => item.id === sceneId) ?? setup.scenes[0] ?? null;
  const lines = scene ? setup.lines.filter((line) => line.scene_id === scene.id) : setup.lines;
  return { ...setup, scene, lines };
}

export function getLocalScriptDetails(scriptId: string): ScriptDetails | null {
  const setup = getLocalScriptSetup(scriptId);
  if (!setup || setup.script?.id !== scriptId) return null;
  return {
    scenes: setup.scenes,
    characters: setup.characters,
    lines: setup.lines,
  };
}

export function saveImportedLocalScript(draft: ScriptImportDraft, userId: string, parsedLines: { characterName: string | null; text: string }[]) {
  const now = new Date().toISOString();
  const scriptId = `local-script-${crypto.randomUUID()}`;
  const sceneId = `local-scene-${crypto.randomUUID()}`;
  const names = Array.from(new Set(parsedLines.map((line) => line.characterName).filter(Boolean))) as string[];
  const characters: CharacterRecord[] = names.map((name, index) => ({
    id: `local-char-${crypto.randomUUID()}`,
    script_id: scriptId,
    name,
    role: null,
    actor_type: index === 0 ? "user" : "ai",
    voice: index === 0 ? "Tu voz" : "Sofia (Femenina)",
    base_emotion: "Neutral",
    sort_order: index + 1,
    created_at: now,
  }));
  const byName = new Map(characters.map((character) => [character.name.toUpperCase(), character]));

  const script: ScriptRecord = {
    id: scriptId,
    user_id: userId,
    title: draft.title.trim(),
    author: draft.author?.trim() || null,
    genre: draft.genre?.trim() || "Importado",
    act_count: 1,
    description: draft.description?.trim() || "Libreto importado en este navegador.",
    is_favorite: false,
    is_active: false,
    is_public: false,
    created_at: now,
    updated_at: now,
    raw_text: draft.rawText,
    source_type: "imported",
    imported_at: now,
    deleted_at: null,
  };

  const scene = {
    id: sceneId,
    script_id: scriptId,
    title: "Escena importada",
    location: null,
    description: "Escena creada al importar el libreto.",
    sort_order: 1,
    created_at: now,
  };

  const lines = parsedLines.map((line, index) => {
    const character = line.characterName ? byName.get(line.characterName.toUpperCase()) ?? null : null;
    return {
      id: `local-line-${crypto.randomUUID()}`,
      scene_id: sceneId,
      character_id: character?.id ?? null,
      line_order: index + 1,
      text: line.text,
      cue: null,
      duration_seconds: Math.max(3, Math.min(12, Math.round(line.text.split(/\s+/).length / 2.4))),
      created_at: now,
      character,
    };
  });

  const library = readLibrary();
  library.scripts = [script, ...library.scripts.filter((item) => item.id !== script.id)];
  library.setups[scriptId] = {
    script,
    scenes: [scene],
    scene,
    characters,
    lines,
  };
  writeLibrary(library);
  return script;
}

export function duplicateLocalSetup(setup: ScriptSetup, userId: string) {
  if (!setup.script) throw new Error("No hay libreto para duplicar.");
  const now = new Date().toISOString();
  const scriptId = `local-script-${crypto.randomUUID()}`;
  const sceneIdMap = new Map<string, string>();
  const charIdMap = new Map<string, string>();

  const characters: CharacterRecord[] = setup.characters.map((character) => {
    const id = `local-char-${crypto.randomUUID()}`;
    charIdMap.set(character.id, id);
    return { ...character, id, script_id: scriptId, created_at: now };
  });

  const scenes = setup.scenes.map((scene) => {
    const id = `local-scene-${crypto.randomUUID()}`;
    sceneIdMap.set(scene.id, id);
    return { ...scene, id, script_id: scriptId, created_at: now };
  });

  const lines = setup.lines.map((line) => {
    const sceneId = sceneIdMap.get(line.scene_id) ?? scenes[0]?.id ?? `local-scene-${crypto.randomUUID()}`;
    const characterId = line.character_id ? (charIdMap.get(line.character_id) ?? null) : null;
    const character = characters.find((item) => item.id === characterId) ?? null;
    return {
      ...line,
      id: `local-line-${crypto.randomUUID()}`,
      scene_id: sceneId,
      character_id: characterId,
      character,
      created_at: now,
    };
  });

  const script: ScriptRecord = {
    ...setup.script,
    id: scriptId,
    user_id: userId,
    title: `${setup.script.title} (copia)`,
    is_active: false,
    is_favorite: false,
    is_public: false,
    source_type: "duplicated",
    imported_at: now,
    created_at: now,
    updated_at: now,
    deleted_at: null,
  };

  const library = readLibrary();
  library.scripts = [script, ...library.scripts.filter((item) => item.id !== script.id)];
  library.setups[scriptId] = {
    script,
    scenes,
    scene: scenes[0] ?? null,
    characters,
    lines,
  };
  writeLibrary(library);
  return script;
}

export function patchLocalScript(scriptId: string, userId: string, patch: Partial<ScriptRecord>) {
  const library = readLibrary();
  const index = library.scripts.findIndex((item) => item.id === scriptId && item.user_id === userId);
  if (index < 0) throw new Error("No se encontro el libreto local.");
  const updated = { ...library.scripts[index], ...patch, updated_at: new Date().toISOString() };
  library.scripts[index] = updated;
  if (library.setups[scriptId]?.script) {
    library.setups[scriptId] = {
      ...library.setups[scriptId],
      script: updated,
    };
  }
  writeLibrary(library);
  return updated;
}

export function removeLocalScript(scriptId: string, userId: string) {
  const library = readLibrary();
  library.scripts = library.scripts.filter((item) => !(item.id === scriptId && item.user_id === userId));
  delete library.setups[scriptId];
  writeLibrary(library);
}
