import type { AiProviderId } from "@/lib/ai/types";

export function feedbackSourceLabel(source?: AiProviderId | string) {
  if (source === "gemini") return "Notas del director · Gemini";
  if (source === "groq") return "Notas del director · Groq";
  if (source === "openai") return "Notas del director · OpenAI";
  return "Notas locales";
}
