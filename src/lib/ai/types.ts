/** Contrato de IA: hoy feedback; mañana improvisación u otras tareas sin rehacer la app. */

export type AiProviderId = "gemini" | "groq" | "openai" | "template";

export type RehearsalFeedbackInput = {
  scriptTitle: string;
  sceneTitle: string;
  characterName: string;
  memorization: number;
  completed: number;
  total: number;
  skipped: number;
  difficulty: number;
  /** Si es "lectura", el prompt no debe evaluar memorizacion. */
  mode?: string;
};

export type RehearsalFeedbackResult = {
  text: string;
  source: AiProviderId;
  model?: string | null;
  reason?: string | null;
};

export type RehearsalAiProvider = {
  id: AiProviderId;
  generateFeedback: (input: RehearsalFeedbackInput) => Promise<string>;
};

export type ScriptSegmentInput = {
  rawText: string;
  title?: string;
};

export type SegmentedScriptLine = {
  characterName: string | null;
  text: string;
  cue?: string | null;
};

export type SegmentedScriptScene = {
  title: string;
  location: string | null;
  lines: SegmentedScriptLine[];
};

export type ScriptSegmentResult = {
  title: string | null;
  characters: string[];
  scenes: SegmentedScriptScene[];
  source: Exclude<AiProviderId, "template">;
};
