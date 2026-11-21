/**
 * script-pipeline.ts
 * Pipeline de Ingestión Teatral: Parser Espacial + Calibración TinyLLM + Reparto Inteligente
 *
 * Etapas del pipeline:
 * 1. Sanitización y conversión a líneas geométricas (X, Y).
 * 2. Calibración del formato mediante TinyLLM (Structured Output Zod) o Heurística Espacial.
 * 3. Pre-segmentación geométrica de Actos, Escenas, Personajes y Diálogos.
 * 4. Cálculo de Matriz de Co-ocurrencia y Conflictos directos de diálogo.
 * 5. Ensamblaje del modelo canónico ScriptSetup listo para ensayar (individual o reparto en grupo).
 */

import {
  extractGeometricLinesFromText,
  calibrateScriptWithTinyLLM,
  parseGeometricScript,
  type ScriptRules,
} from "./script-parser";
import {
  computeConflictMatrixInMemory,
  assignCharactersToHumans,
  type CharacterStats,
  type CastAssignmentResult,
} from "./actor-assignment";
import { checkTinyLLMHardware, type HardwareStatus } from "./tiny-character-detector";
import { consolidateScriptLines } from "@/lib/consolidate-script-lines";
import type {
  CharacterRecord,
  SceneRecord,
  ScriptImportDraft,
  ScriptLineWithCharacter,
  ScriptRecord,
  ScriptSetup,
} from "@/lib/rehearsal-data";

export interface PipelineProgress {
  step: number;
  totalSteps: number;
  message: string;
  stage: "sanitize" | "calibrate" | "segment_spatial" | "matrix_cast" | "assemble" | "done";
}

export interface PipelineResult {
  setup: ScriptSetup;
  stats: {
    actsCount: number;
    scenesCount: number;
    charactersCount: number;
    linesCount: number;
    charactersPerScene: Record<string, string[]>;
    hardware: HardwareStatus;
    usedTinyLLM: boolean;
    /** Origen: Gemini (servidor) o calibración local */
    source: "gemini" | "ollama" | "fastapi" | "spatial_heuristic";
    formatDetected: string;
  };
  rules: ScriptRules;
  conflictMatrix: {
    characterStats: CharacterStats[];
    directDialogueMatrix: Record<string, Record<string, number>>;
  };
  initialCast?: CastAssignmentResult;
}

/** Envuelve un ScriptSetup (p. ej. de Gemini) en PipelineResult para la UI de revisión. */
export function pipelineResultFromSetup(
  setup: ScriptSetup,
  source: PipelineResult["stats"]["source"],
  formatDetected: ScriptRules["formatoDetectado"] = "mixto",
): PipelineResult {
  const hardware: HardwareStatus = {
    device: "browser-cpu",
    device_name: source === "gemini" ? "Gemini (servidor)" : "Navegador",
    gpu_available: false,
    vram_gb: null,
    dtype: "n/a",
    model_id: source === "gemini" ? "gemini" : "heuristic",
  };
  return {
    setup,
    stats: {
      actsCount: Math.max(1, setup.script?.act_count ?? 1),
      scenesCount: setup.scenes.length,
      charactersCount: setup.characters.length,
      linesCount: setup.lines.length,
      charactersPerScene: {},
      hardware,
      usedTinyLLM: source === "ollama" || source === "fastapi",
      source,
      formatDetected,
    },
    rules: {
      formatoDetectado: formatDetected,
      xMinPersonaje: 0,
      xMinDialogo: 0,
      usaPrefijoEnLinea: true,
      aliasPersonajes: {},
    },
    conflictMatrix: {
      characterStats: [],
      directDialogueMatrix: {},
    },
  };
}

const AVAILABLE_TTS_VOICES = [
  "Sofia (Femenina)",
  "Diego (Masculino)",
  "Carmen (Femenina)",
  "Mateo (Masculino)",
  "Lucia (Femenina)",
  "Alejandro (Masculino)",
];

export function sanitizeRawText(text: string): string {
  return text
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/\f/g, "\n")
    .replace(/[“”«»]/g, '"')
    .replace(/[‘’`]/g, "'")
    .replace(/[—–]/g, "-")
    .replace(/^\s*(?:-\s*\d+\s*-|pág(?:ina)?\.?\s*\d+|\d+)\s*$/gim, "")
    .trim();
}

/**
 * Ejecuta el pipeline completo de procesamiento espacial asistido por TinyLLM.
 */
export async function executeScriptPipeline(
  draft: ScriptImportDraft,
  userId: string,
  onProgress?: (progress: PipelineProgress) => void,
  numPhysicalActors: number = 1,
): Promise<PipelineResult> {
  const now = new Date().toISOString();
  const scriptId = `local-script-${crypto.randomUUID()}`;

  // ─── PASO 1: Sanitización y coordenadas geométricas ────────────────────────
  onProgress?.({
    step: 1,
    totalSteps: 5,
    message: "Sanitizando texto y extrayendo coordenadas espaciales...",
    stage: "sanitize",
  });
  const cleanText = sanitizeRawText(draft.rawText);
  const geometricLines = extractGeometricLinesFromText(cleanText);

  // ─── PASO 2: Calibración con TinyLLM (Structured Output Zod) ───────────────
  onProgress?.({
    step: 2,
    totalSteps: 5,
    message: "Calibrando reglas espaciales con TinyLLM (sangrías X y formato)...",
    stage: "calibrate",
  });
  const { rules, source } = await calibrateScriptWithTinyLLM(geometricLines);
  const hardware = await checkTinyLLMHardware();
  const usedTinyLLM = source === "ollama" || source === "fastapi";

  // ─── PASO 3: Segmentación espacial de Actos, Escenas y Diálogos ────────────
  onProgress?.({
    step: 3,
    totalSteps: 5,
    message: "Segmentando escenas y separando parlamentos de acotaciones...",
    stage: "segment_spatial",
  });
  const geometricResult = parseGeometricScript(geometricLines, rules);

  // ─── PASO 4: Matriz de Conflictos y Reparto Humano / TTS ───────────────────
  onProgress?.({
    step: 4,
    totalSteps: 5,
    message: "Calculando matriz de co-ocurrencia y reparto óptimo de actores...",
    stage: "matrix_cast",
  });
  const conflictMatrix = computeConflictMatrixInMemory(
    geometricResult.scenes.map((s) => ({
      id: s.id,
      lines: s.lines.map((l) => ({
        characterName: l.characterName,
        text: l.text,
      })),
    })),
  );

  const initialCast = assignCharactersToHumans(
    conflictMatrix.characterStats,
    conflictMatrix.directDialogueMatrix,
    numPhysicalActors,
  );

  // ─── PASO 5: Ensamblaje en formato canónico ScriptSetup ─────────────────────
  onProgress?.({
    step: 5,
    totalSteps: 5,
    message: "Construyendo libreto, escenas y reparto para ensayar...",
    stage: "assemble",
  });

  // 1. Crear registros de Personajes
  const characters: CharacterRecord[] = conflictMatrix.characterStats.map((stat, idx) => {
    const isFirst = idx === 0;
    const voiceIndex = idx % AVAILABLE_TTS_VOICES.length;
    return {
      id: `local-char-${crypto.randomUUID()}`,
      script_id: scriptId,
      name: stat.name,
      role: `${stat.totalWords} palabras (${stat.scenes.size} escenas)`,
      actor_type: isFirst ? "user" : "ai",
      voice: isFirst ? "Tu voz" : AVAILABLE_TTS_VOICES[voiceIndex],
      base_emotion: "Neutral",
      sort_order: idx + 1,
      created_at: now,
    };
  });

  const charMapByName = new Map(characters.map((c) => [c.name.toUpperCase(), c]));

  // 2. Crear registros de Escenas
  const scenes: SceneRecord[] = geometricResult.scenes.map((sc, idx) => ({
    id: `local-scene-${crypto.randomUUID()}`,
    script_id: scriptId,
    title: sc.title,
    location: null,
    description:
      sc.description?.trim() ||
      `Escena detectada por parser espacial (${sc.lines.filter((l) => l.type === "dialogo").length} líneas).`,
    sort_order: idx + 1,
    created_at: now,
  }));

  // 3. Crear registros de Líneas de ensayo
  const lines: ScriptLineWithCharacter[] = [];
  const charactersPerScene: Record<string, string[]> = {};

  for (let sIdx = 0; sIdx < geometricResult.scenes.length; sIdx++) {
    const scGeo = geometricResult.scenes[sIdx];
    const scRecord = scenes[sIdx];
    const sceneCharactersSet = new Set<string>();
    let dialogueOrder = 0;
    let pendingCue: string | null = null;

    for (const lineGeo of scGeo.lines) {
      if (lineGeo.type === "acotacion") {
        pendingCue = pendingCue ? `${pendingCue} · ${lineGeo.text}` : lineGeo.text;
        continue;
      }
      if (lineGeo.type !== "dialogo") continue;

      const speakerName = lineGeo.characterName?.trim().toUpperCase();
      const charRecord = speakerName ? charMapByName.get(speakerName) : null;
      if (speakerName) sceneCharactersSet.add(speakerName);

      const wordCount = lineGeo.text.trim().split(/\s+/).filter(Boolean).length;
      const durationSeconds = Math.max(3, Math.min(45, Math.ceil(wordCount / 2.3)));

      const cue = lineGeo.parenthetical
        ? pendingCue
          ? `${pendingCue} (${lineGeo.parenthetical})`
          : lineGeo.parenthetical
        : pendingCue;
      pendingCue = null;

      lines.push({
        id: `local-line-${crypto.randomUUID()}`,
        scene_id: scRecord.id,
        character_id: charRecord ? charRecord.id : null,
        line_order: ++dialogueOrder,
        text: lineGeo.text,
        cue: cue ?? null,
        duration_seconds: durationSeconds,
        created_at: now,
        character: charRecord ?? null,
      });
    }

    charactersPerScene[scRecord.title] = Array.from(sceneCharactersSet);
  }

  // 4. Conteo de Actos
  const actsCount = Math.max(1, geometricResult.scenes.filter((s) => s.actTitle).length || 1);

  // 5. Registro del Libreto
  const script: ScriptRecord = {
    id: scriptId,
    user_id: userId,
    title: draft.title.trim() || "Libreto importado",
    author: draft.author?.trim() || null,
    genre:
      draft.genre?.trim() || (rules.formatoDetectado === "teatro_hispano" ? "Teatro" : "Guion"),
    act_count: actsCount,
    description:
      draft.description?.trim() ||
      `Libreto procesado con Parser Espacial + TinyLLM (${scenes.length} escenas, ${characters.length} personajes).`,
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

  const consolidatedLines = consolidateScriptLines(lines);

  const setup: ScriptSetup = {
    script,
    scenes,
    scene: scenes[0] ?? null,
    characters,
    lines: consolidatedLines,
  };

  onProgress?.({
    step: 5,
    totalSteps: 5,
    message: `¡Pipeline completado! ${scenes.length} escenas y ${characters.length} personajes listos para ensayar.`,
    stage: "done",
  });

  return {
    setup,
    stats: {
      actsCount,
      scenesCount: scenes.length,
      charactersCount: characters.length,
      linesCount: consolidatedLines.length,
      charactersPerScene,
      hardware,
      usedTinyLLM,
      source,
      formatDetected: rules.formatoDetectado,
    },
    rules,
    conflictMatrix,
    initialCast,
  };
}
