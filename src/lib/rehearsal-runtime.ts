import { DEMO_JULIETA_ID, DEMO_ROMEO_ID, DEMO_SCENE_ID, DEMO_SCRIPT_ID, getDemoScriptSetup } from "@/lib/demo-script";
import { canUseBrowserStorage, readJson, removeKey, withTimeout, writeJson } from "@/lib/browser";
import { getLocalAuthUser } from "@/lib/local-auth";
import {
  getScriptSetup,
  getScripts,
  type CharacterRecord,
  type RehearsalSummary,
  type SceneRecord,
  type ScriptRecord,
  type ScriptSetup,
} from "@/lib/rehearsal-data";

const ACTIVE_KEY = "ensaya-ia-active-rehearsal";
const REPORT_KEY = "ensaya-ia-last-report";
const HISTORY_KEY = "ensaya-ia-rehearsal-history";
/** Claves legacy solo para migracion; el producto es Ensaya IA. */
const LEGACY_ACTIVE_KEY = "cine-estrella-active-rehearsal";
const LEGACY_REPORT_KEY = "cine-estrella-last-report";
const LEGACY_HISTORY_KEY = "cine-estrella-rehearsal-history";
const HISTORY_LIMIT = 20;

export type ActiveRehearsal = {
  scriptId: string;
  sceneId: string;
  selectedCharacterId: string;
  mode: string;
  aiDifficulty: number;
  suggestEmotions: boolean;
  allowImprov: boolean;
  feedbackEnabled: boolean;
  supabaseSessionId: string | null;
  startedAt: string;
  source: "supabase" | "demo";
  /** Presente en modo grupo: id del grupo local asociado al libreto. */
  grupoId?: string | null;
};

export type LocalRehearsalReport = {
  scriptTitle: string;
  sceneTitle: string;
  sceneLocation: string | null;
  characterName: string;
  mode: string;
  aiDifficulty: number;
  startedAt: string;
  endedAt: string;
  completedLines: number;
  totalLines: number;
  skippedLines: number;
  repeatedLines: number;
  memorization: number;
  clarity: number;
  expression: number;
  rhythm: number;
  projection: number;
  score: number;
  feedback: string;
  feedbackSource?: string;
};

export type ReportContext = {
  script?: ScriptRecord | null;
  scene?: SceneRecord | null;
  selectedCharacter?: CharacterRecord | null;
  scriptId?: string | null;
  sceneId?: string | null;
  characterId?: string | null;
};

export function saveActiveRehearsal(rehearsal: ActiveRehearsal) {
  writeJson(sessionStorage, ACTIVE_KEY, rehearsal);
}

export function loadActiveRehearsal(): ActiveRehearsal | null {
  return readJson<ActiveRehearsal | null>(sessionStorage, ACTIVE_KEY, null, [LEGACY_ACTIVE_KEY]);
}

export function clearActiveRehearsal() {
  removeKey(sessionStorage, ACTIVE_KEY);
}

export function saveLocalReport(report: LocalRehearsalReport, context?: ReportContext) {
  writeJson(sessionStorage, REPORT_KEY, report);
  appendLocalHistory(report, context);
}

export function loadLocalReport(): LocalRehearsalReport | null {
  return readJson<LocalRehearsalReport | null>(sessionStorage, REPORT_KEY, null, [LEGACY_REPORT_KEY]);
}

function readHistory() {
  return readJson<RehearsalSummary[]>(localStorage, HISTORY_KEY, [], [LEGACY_HISTORY_KEY]);
}

export function listLocalHistory(limit = 10): RehearsalSummary[] {
  const userId = getLocalAuthUser()?.id ?? null;
  const rows = readHistory().filter((row) => {
    if (!userId) return false;
    // Entradas viejas sin user_id: no se muestran a otros; solo al usuario actual si coincide al re-guardar.
    return row.user_id === userId;
  });
  return rows.slice(0, limit);
}

/** Busca una entrada del historial local por id (del usuario actual). */
export function getLocalHistoryById(id: string): RehearsalSummary | null {
  if (!id) return null;
  return listLocalHistory(HISTORY_LIMIT).find((row) => row.id === id) ?? null;
}

/** Convierte un resumen de historial a reporte local y lo deja en sessionStorage. */
export function loadReportFromHistoryId(id: string): LocalRehearsalReport | null {
  const row = getLocalHistoryById(id);
  if (!row) return null;
  const report: LocalRehearsalReport = {
    scriptTitle: row.script?.title ?? "Sin libreto",
    sceneTitle: row.scene?.title ?? "Sin escena",
    sceneLocation: row.scene?.location ?? row.scene?.description ?? null,
    characterName: row.selectedCharacter?.name ?? "Actor",
    mode: row.mode,
    aiDifficulty: row.ai_difficulty ?? 50,
    startedAt: row.started_at,
    endedAt: row.ended_at ?? row.updated_at,
    completedLines: row.completed_lines ?? 0,
    totalLines: row.total_lines ?? 0,
    skippedLines: row.skipped_lines ?? 0,
    repeatedLines: row.repeated_lines ?? 0,
    memorization: row.memorization_score ?? 0,
    clarity: row.clarity_score ?? 0,
    expression: row.expression_score ?? 0,
    rhythm: row.rhythm_score ?? 0,
    projection: row.projection_score ?? 0,
    score: row.score ?? 0,
    feedback: row.feedback_summary ?? "Sin retroalimentacion guardada.",
    feedbackSource: "history",
  };
  writeJson(sessionStorage, REPORT_KEY, report);
  return report;
}

function appendLocalHistory(report: LocalRehearsalReport, context?: ReportContext) {
  if (!canUseBrowserStorage()) return;
  const now = new Date().toISOString();
  const userId = getLocalAuthUser()?.id ?? null;
  const scriptId = context?.scriptId ?? context?.script?.id ?? "local-script-unknown";
  const sceneId = context?.sceneId ?? context?.scene?.id ?? "local-scene-unknown";
  const summary: RehearsalSummary = {
    id: `local-session-${crypto.randomUUID()}`,
    ai_difficulty: report.aiDifficulty,
    allow_improv: true,
    clarity_score: report.clarity,
    completed_lines: report.completedLines,
    ended_at: report.endedAt,
    expression_score: report.expression,
    feedback_summary: report.feedback,
    feedback_enabled: true,
    memorization_score: report.memorization,
    mode: report.mode,
    projection_score: report.projection,
    repeated_lines: report.repeatedLines,
    rhythm_score: report.rhythm,
    scene_id: sceneId,
    score: report.score,
    selected_character_id: context?.characterId ?? context?.selectedCharacter?.id ?? null,
    script_id: scriptId,
    skipped_lines: report.skippedLines,
    started_at: report.startedAt,
    status: "completed",
    suggest_emotions: true,
    teleprompter_last_event: "Ensayo local con voz del navegador.",
    teleprompter_session_id: null,
    teleprompter_status: "stopped",
    total_lines: report.totalLines,
    updated_at: now,
    user_id: userId,
    script: context?.script ?? {
      id: scriptId,
      user_id: userId,
      title: report.scriptTitle,
      author: null,
      genre: null,
      act_count: 1,
      description: null,
      is_favorite: false,
      is_active: false,
      is_public: false,
      created_at: now,
      updated_at: now,
      raw_text: null,
      source_type: "local",
      imported_at: null,
      deleted_at: null,
    },
    scene: context?.scene ?? {
      id: sceneId,
      script_id: scriptId,
      title: report.sceneTitle,
      location: report.sceneLocation,
      description: null,
      sort_order: 1,
      created_at: now,
    },
    selectedCharacter: context?.selectedCharacter ?? null,
  };
  writeJson(localStorage, HISTORY_KEY, [summary, ...readHistory()].slice(0, HISTORY_LIMIT));
}

export async function loadRecentRehearsalsSafe(limit = 3) {
  return listLocalHistory(limit);
}

export async function loadScriptsSafe(): Promise<ScriptRecord[]> {
  try {
    const scripts = await withTimeout(getScripts());
    if (scripts.length > 0) return scripts;
  } catch {
    // El catalogo local/demo sigue disponible si el remoto no responde.
  }
  return [getDemoScriptSetup().script!];
}

export async function loadScriptSetupSafe(scriptId?: string, sceneId?: string): Promise<ScriptSetup> {
  try {
    const setup = await withTimeout(getScriptSetup(scriptId, sceneId));
    if (setup.script && setup.lines.length > 0) return setup;
  } catch {
    // Escena del balcon empaquetada para la demo.
  }
  return getDemoScriptSetup();
}

export async function startLocalRehearsal(draft: {
  scriptId: string;
  sceneId: string;
  selectedCharacterId: string;
  mode: string;
  aiDifficulty: number;
  suggestEmotions: boolean;
  allowImprov: boolean;
  feedbackEnabled: boolean;
  totalLines: number;
  source: "supabase" | "demo";
  grupoId?: string | null;
}) {
  const active: ActiveRehearsal = {
    scriptId: draft.scriptId,
    sceneId: draft.sceneId,
    selectedCharacterId: draft.selectedCharacterId,
    mode: draft.mode,
    aiDifficulty: draft.aiDifficulty,
    suggestEmotions: draft.suggestEmotions,
    allowImprov: draft.allowImprov,
    feedbackEnabled: draft.feedbackEnabled,
    supabaseSessionId: null,
    startedAt: new Date().toISOString(),
    source: draft.source,
    grupoId: draft.grupoId ?? null,
  };
  saveActiveRehearsal(active);
  return active;
}

export function defaultCharacterId(characters: CharacterRecord[]) {
  return characters.find((character) => character.actor_type === "user")?.id ?? characters[0]?.id ?? DEMO_ROMEO_ID;
}

export function demoIds() {
  return { scriptId: DEMO_SCRIPT_ID, sceneId: DEMO_SCENE_ID, characterId: DEMO_ROMEO_ID, aiId: DEMO_JULIETA_ID };
}
