function readEnv(name: string) {
  if (typeof process === "undefined" || !process.env) return "";
  return process.env[name]?.trim() ?? "";
}

export function aiProviderName() {
  return (readEnv("AI_PROVIDER") || "gemini").toLowerCase();
}

export function aiTimeoutMs() {
  const raw = Number(readEnv("AI_TIMEOUT_MS") || "8000");
  return Number.isFinite(raw) && raw >= 2000 ? raw : 8000;
}

export function geminiApiKey() {
  return readEnv("GEMINI_API_KEY") || readEnv("GOOGLE_GENERATIVE_AI_API_KEY");
}

export function geminiModel() {
  return readEnv("AI_MODEL") || readEnv("GEMINI_MODEL") || "gemini-2.5-flash";
}

/** Análisis de audio. No hereda el modelo viejo del importador de libretos. */
export function interpretationModel() {
  return readEnv("AI_MODEL") || readEnv("GEMINI_MODEL") || "gemini-3.5-flash-lite";
}

export function interpretationTimeoutMs() {
  const raw = Number(readEnv("INTERPRETATION_TIMEOUT_MS") || "30000");
  return Number.isFinite(raw) && raw >= 5000 ? Math.min(raw, 90_000) : 30_000;
}

export function groqApiKey() {
  return readEnv("GROQ_API_KEY");
}

export function groqModel() {
  return readEnv("GROQ_MODEL") || "llama-3.3-70b-versatile";
}

export function openaiApiKey() {
  return readEnv("OPENAI_API_KEY");
}

export function openaiModel() {
  return readEnv("OPENAI_MODEL") || "gpt-4o-mini";
}
