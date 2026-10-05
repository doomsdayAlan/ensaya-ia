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
};

export type RehearsalFeedbackResult = {
  text: string;
  source: AiProviderId;
};

export type RehearsalAiProvider = {
  id: AiProviderId;
  generateFeedback: (input: RehearsalFeedbackInput) => Promise<string>;
};
