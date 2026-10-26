import type { AiProviderId } from "@/lib/ai/types";

export function feedbackSourceLabel(source?: AiProviderId | string) {
  if (source === "gemini" || source === "groq" || source === "openai") {
    return "Notas del director · modelo de lenguaje (opcional)";
  }
  return "Notas del director · plantillas locales";
}
