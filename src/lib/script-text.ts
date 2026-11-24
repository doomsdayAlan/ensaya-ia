/**
 * script-text.ts
 * Parser de texto con TinyLLM para detección y normalización de personajes,
 * segmentación de actos y escenas, y utilidades compartidas para importación.
 */

import {
  detectCharactersWithTinyLLM,
  fallbackCpuCharacterDetection,
  type CharacterDetectionResponse,
} from "./ai/tiny-character-detector";

export interface ParsedScriptLine {
  id: string;
  character: string;
  text: string;
  parenthetical?: string;
  estimatedDurationSec: number;
}

export interface ParsedScriptScene {
  id: string;
  title: string;
  lines: ParsedScriptLine[];
  characters: string[];
}

export interface ParsedScriptDraft {
  title: string;
  actsCount: number;
  scenes: ParsedScriptScene[];
  characters: string[];
  detectionMetadata?: CharacterDetectionResponse;
}

/** Encabezado = la linea ENTERA es ACTO/ESCENA/CUADRO o INT./EXT. */
const SCENE_HEADING_RE =
  /^(?:(ACTO\s+[IVXLC\d]+.*)|(ESCENA\s+[IVXLC\d]+.*)|(CUADRO\s+[IVXLC\d]+.*)|((?:INT|EXT|INT\.\/EXT\.)[.\s].*))$/i;

const SCENE_HEADER_ONLY_RE =
  /^(?:ACTO|ESCENA|Acto|Escena)(?:\s+(?:\d+|[IVXLCDM]+|PRIMERO|SEGUNDO|TERCERO|CUARTO|QUINTO|SEXTO|SEPTIMO|SÉPTIMO|OCTAVO|NOVENO|DECIMO|DÉCIMO|UNICO|ÚNICO|[A-ZÁÉÍÓÚÑ]{1,16}))?\s*$/i;

const INLINE_DIALOGUE_RE =
  /^([A-ZÁÉÍÓÚÑÜ][A-ZÁÉÍÓÚÑÜ0-9\s.-]{1,32}?)(?:\s*\(([^)]+)\))?\s*[:.—-]+\s+(.+)$/;

const STANDALONE_CUE_RE = /^([A-ZÁÉÍÓÚÑÜ][A-ZÁÉÍÓÚÑÜ0-9\s.-]{1,32}?)(?:\s*\(([^)]+)\))?\s*:?$/;

/**
 * Normaliza el nombre de un personaje: elimina acotaciones de tipo V.O., O.S., etc.
 * y limpia espacios y signos de puntuación finales.
 */
export function cleanCharacterName(value: string): string {
  return value
    .replace(/\((?:V\.?O\.?|O\.?S\.?|OFF|CONT'?D|CONTINÚA|VOZ|EN OFF)\)/gi, "")
    .replace(/[:.–—-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function cleanCharacterCue(raw: string): string {
  return raw
    .replace(/\((?:V\.?O\.?|O\.?S\.?|OFF|CONT'?D|CONTINÚA|VOZ|EN OFF)\)/gi, "")
    .replace(/[:.—-]+$/, "")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
}

/**
 * Detecta si una línea de texto es el pie de personaje (cue) en mayúsculas,
 * línea corta y sin ser un número de página ni una acotación entre paréntesis.
 */
export function isCharacterCue(line: string): boolean {
  const cleaned = cleanCharacterName(line);
  if (!cleaned || cleaned.length > 40) return false;
  if (isSceneHeaderLine(cleaned)) return false;
  if (/^\d+$/.test(cleaned)) return false;
  if (/[.!?¿¡]/.test(cleaned)) return false;
  return cleaned === cleaned.toUpperCase() && /[A-ZÁÉÍÓÚÑ]/i.test(cleaned);
}

/**
 * Detecta si una línea es un encabezado de escena o acto.
 */
export function isSceneHeaderLine(line: string): boolean {
  const trimmed = line.trim();
  return SCENE_HEADER_ONLY_RE.test(trimmed) || SCENE_HEADING_RE.test(trimmed);
}

/**
 * Si la línea tiene formato "PERSONAJE: diálogo" o "PERSONAJE - diálogo",
 * la parte y devuelve { name, rest }. Si no, devuelve null.
 */
export function splitNamedCue(line: string): { name: string; rest: string } | null {
  const match = line.trim().match(/^([^:]{1,40}):\s*(.*)$/);
  if (!match) return null;
  const name = cleanCharacterName(match[1]);
  if (!name || name.length < 2 || name.length > 40) return null;
  if (isSceneHeaderLine(name)) return null;
  if (/[.!?¿¡]/.test(name) || /^\d+$/.test(name)) return null;
  return { name, rest: match[2].trim() };
}

function appendDialogueLine(
  scene: ParsedScriptScene,
  counter: number,
  character: string,
  text: string,
  parenthetical?: string,
) {
  if (!scene.characters.includes(character)) {
    scene.characters.push(character);
  }
  const wordCount = text.trim().split(/\s+/).filter(Boolean).length;
  const estimatedDurationSec = Math.max(2, Math.ceil(wordCount / 2.5));

  scene.lines.push({
    id: `line-${counter}`,
    character,
    text,
    parenthetical,
    estimatedDurationSec,
  });
}

/**
 * Parsea el texto de un libreto identificando actos, escenas, personajes y parlamentos.
 * Síncrono (usa heurísticas CPU para alias y descarte de acotaciones).
 */
export function parseScriptText(
  rawText: string,
  defaultTitle = "Escena importada",
  aliasOverride?: Record<string, string>,
  discardedOverride?: Set<string>,
): ParsedScriptDraft {
  const cpuDetection = fallbackCpuCharacterDetection(rawText);
  const aliasMap = aliasOverride ?? cpuDetection.alias_map;
  const discardedSet = discardedOverride ?? new Set(cpuDetection.discarded);

  const lines = rawText
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((l) => l.trim());

  let actsCount = 0;
  const scenes: ParsedScriptScene[] = [];
  let currentScene: ParsedScriptScene = {
    id: "scene-1",
    title: defaultTitle,
    lines: [],
    characters: [],
  };

  let currentCharacter: string | null = null;
  let currentParenthetical: string | undefined = undefined;
  let lineCounter = 0;

  const commitSceneIfNotEmpty = () => {
    if (currentScene.lines.length > 0) {
      scenes.push(currentScene);
    }
  };

  for (const line of lines) {
    if (!line) {
      currentCharacter = null;
      currentParenthetical = undefined;
      continue;
    }

    // 1. Encabezado de Acto o Escena
    if (isSceneHeaderLine(line)) {
      if (/^ACTO\b/i.test(line)) {
        actsCount += 1;
      }
      commitSceneIfNotEmpty();
      const nextIndex = scenes.length + 1;
      currentScene = {
        id: `scene-${nextIndex}`,
        title: line.toUpperCase(),
        lines: [],
        characters: [],
      };
      currentCharacter = null;
      currentParenthetical = undefined;
      continue;
    }

    // 2. Diálogo en una sola línea (Ej. "ROMEO (susurrando): Hola")
    const inlineMatch = line.match(INLINE_DIALOGUE_RE);
    if (inlineMatch) {
      const rawName = cleanCharacterCue(inlineMatch[1]);
      if (rawName && !discardedSet.has(rawName)) {
        const canonicalName = aliasMap[rawName] || rawName;
        const paren = inlineMatch[2]?.trim();
        const speech = inlineMatch[3].trim();
        appendDialogueLine(currentScene, ++lineCounter, canonicalName, speech, paren);
        currentCharacter = null;
        continue;
      }
    }

    // 3. Nombre del personaje en línea independiente en MAYÚSCULAS
    if (line === line.toUpperCase() && line.length <= 40 && !/^\d+$/.test(line)) {
      const cueMatch = line.match(STANDALONE_CUE_RE);
      if (cueMatch) {
        const rawName = cleanCharacterCue(cueMatch[1]);
        if (rawName && !discardedSet.has(rawName)) {
          currentCharacter = aliasMap[rawName] || rawName;
          currentParenthetical = cueMatch[2]?.trim();
          continue;
        }
      }
    }

    // 4. Acotación entre paréntesis debajo del nombre
    if (currentCharacter && /^\([^)]+\)$/.test(line)) {
      currentParenthetical = line.slice(1, -1).trim();
      continue;
    }

    // 5. Línea de parlamento asociada al personaje activo
    if (currentCharacter) {
      appendDialogueLine(currentScene, ++lineCounter, currentCharacter, line, currentParenthetical);
      currentParenthetical = undefined;
    }
  }

  commitSceneIfNotEmpty();

  if (scenes.length === 0 && currentScene.lines.length > 0) {
    scenes.push(currentScene);
  }

  const allCharacters = Array.from(new Set(scenes.flatMap((s) => s.characters)));

  return {
    title: defaultTitle,
    actsCount: Math.max(1, actsCount),
    scenes,
    characters: allCharacters,
    detectionMetadata: cpuDetection,
  };
}

/**
 * Versión asíncrona asistida por TinyLLM (consulta GPU/CPU en el backend local
 * para unificar nombres de personajes y filtrar acotaciones antes de construir las escenas).
 */
export async function parseScriptTextWithTinyLLM(
  rawText: string,
  defaultTitle = "Escena importada",
): Promise<ParsedScriptDraft> {
  const detection = await detectCharactersWithTinyLLM(rawText);
  const aliasMap = detection.alias_map;
  const discardedSet = new Set(detection.discarded);

  const draft = parseScriptText(rawText, defaultTitle, aliasMap, discardedSet);
  draft.detectionMetadata = detection;
  return draft;
}

/**
 * Convierte un ParsedScriptDraft en grupos de escenas compatibles con ImportedSceneGroup
 * para la persistencia local o remota.
 */
export function parsedDraftToSceneGroups(draft: ParsedScriptDraft): Array<{
  title: string;
  location?: string | null;
  lines: Array<{ characterName: string | null; text: string }>;
}> {
  return draft.scenes.map((scene) => ({
    title: scene.title,
    lines: scene.lines.map((l) => ({
      characterName: l.character,
      text: l.parenthetical ? `(${l.parenthetical}) ${l.text}` : l.text,
    })),
  }));
}
