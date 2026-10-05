import type { CharacterRecord, ScriptDetails, ScriptImportDraft, ScriptRecord, ScriptSetup } from "@/lib/rehearsal-data";
import { getDemoScriptSetup } from "@/lib/demo-script";
import { readJson, writeJson } from "@/lib/browser";

const LIBRARY_KEY = "ensaya-ia-library";
/** Solo migracion desde almacenamiento antiguo; no es el nombre del producto. */
const LEGACY_LIBRARY_KEY = "cine-estrella-library";

const SCENE_HEADER_RE = /^(ACTO|ESCENA|Escena|Acto)\b/i;

type LocalLibrary = {
  scripts: ScriptRecord[];
  setups: Record<string, ScriptSetup>;
};

type ParsedImportLine = { characterName: string | null; text: string };

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

/** Parte el texto importado por encabezados ACTO/ESCENA; si no hay, una sola escena. */
function splitRawTextIntoScenes(rawText: string): { title: string; body: string }[] {
  const lines = rawText.replace(/\r/g, "").split("\n");
  const scenes: { title: string; bodyLines: string[] }[] = [];
  let current: { title: string; bodyLines: string[] } | null = null;
  let sawHeader = false;

  for (const raw of lines) {
    const trimmed = raw.trim();
    if (SCENE_HEADER_RE.test(trimmed)) {
      sawHeader = true;
      if (current) scenes.push(current);
      current = { title: trimmed.slice(0, 120), bodyLines: [] };
      continue;
    }
    if (!current) current = { title: "Escena importada", bodyLines: [] };
    current.bodyLines.push(raw);
  }
  if (current) scenes.push(current);

  if (!sawHeader) {
    return [{ title: "Escena importada", body: rawText }];
  }

  return scenes.map((scene) => ({
    title: scene.title,
    body: scene.bodyLines.join("\n"),
  }));
}

function cleanCharacterName(line: string) {
  return line.replace(/[:.\-–—]/g, " ").replace(/\s+/g, " ").trim();
}

function isCharacterCue(line: string) {
  const cleaned = cleanCharacterName(line);
  if (!cleaned || cleaned.length > 40) return false;
  if (SCENE_HEADER_RE.test(cleaned)) return false;
  if (/^\d+$/.test(cleaned)) return false;
  if (/[.!?¿¡]/.test(cleaned)) return false;
  return cleaned === cleaned.toUpperCase() && /[A-ZÁÉÍÓÚÑ]/i.test(cleaned);
}

function parseSceneBody(body: string): ParsedImportLine[] {
  const normalizedLines = body
    .replace(/\r/g, "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  const parsed: ParsedImportLine[] = [];
  let currentCharacter: string | null = null;
  let buffer: string[] = [];

  const flush = () => {
    const text = buffer.join(" ").replace(/\s+/g, " ").trim();
    if (text) parsed.push({ characterName: currentCharacter, text });
    buffer = [];
  };

  for (const line of normalizedLines) {
    if (isCharacterCue(line)) {
      flush();
      currentCharacter = cleanCharacterName(line);
      continue;
    }
    buffer.push(line);
  }

  flush();
  return parsed;
}

export function saveImportedLocalScript(draft: ScriptImportDraft, userId: string, parsedLines: ParsedImportLine[]) {
  const now = new Date().toISOString();
  const scriptId = `local-script-${crypto.randomUUID()}`;

  const sceneChunks = splitRawTextIntoScenes(draft.rawText);
  const sceneLineGroups =
    sceneChunks.length === 1 && !SCENE_HEADER_RE.test(sceneChunks[0]?.title ?? "")
      ? [{ title: "Escena importada", lines: parsedLines }]
      : sceneChunks.map((chunk) => ({
          title: chunk.title,
          lines: parseSceneBody(chunk.body),
        }));

  const allLines = sceneLineGroups.flatMap((group) => group.lines);
  const names = Array.from(
    new Set(allLines.map((line) => line.characterName).filter(Boolean)),
  ) as string[];
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
    act_count: Math.max(1, sceneLineGroups.filter((g) => /^(ACTO|Acto)\b/i.test(g.title)).length || 1),
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

  const scenes = sceneLineGroups.map((group, index) => ({
    id: `local-scene-${crypto.randomUUID()}`,
    script_id: scriptId,
    title: group.title || `Escena ${index + 1}`,
    location: null,
    description:
      sceneLineGroups.length === 1
        ? "Escena creada al importar el libreto."
        : `Escena detectada por encabezado al importar.`,
    sort_order: index + 1,
    created_at: now,
  }));

  const lines = sceneLineGroups.flatMap((group, sceneIndex) => {
    const scene = scenes[sceneIndex]!;
    return group.lines.map((line, index) => {
      const character = line.characterName ? byName.get(line.characterName.toUpperCase()) ?? null : null;
      return {
        id: `local-line-${crypto.randomUUID()}`,
        scene_id: scene.id,
        character_id: character?.id ?? null,
        line_order: index + 1,
        text: line.text,
        cue: null,
        duration_seconds: Math.max(3, Math.min(12, Math.round(line.text.split(/\s+/).length / 2.4))),
        created_at: now,
        character,
      };
    });
  });

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
