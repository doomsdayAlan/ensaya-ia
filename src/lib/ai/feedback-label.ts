import { originLabel, type AdviceOrigin } from "@/lib/ai/advice-origin";

/** Línea discreta bajo las notas del director. */
export function feedbackNotesOriginLine(source?: string | null) {
  return source === "gemini" ? "Notas: Gemini" : "Notas: local";
}

export function feedbackSourceLabel(
  source?: string | null,
  model?: string | null,
  reason?: string | null,
) {
  const origin: AdviceOrigin = {
    source: source === "gemini" ? "gemini" : "template",
    model: model ?? null,
    reason: reason ?? (source === "gemini" ? null : "no se pudo usar la IA"),
  };
  return originLabel("notas", origin);
}

export function interpretationSourceLabel(origin: {
  source?: string | null;
  model?: string | null;
  reason?: string | null;
}) {
  return originLabel("consejos", {
    source: origin.source === "gemini" ? "gemini" : "template",
    model: origin.model ?? null,
    reason: origin.reason ?? "no se pudo usar la IA",
  });
}
