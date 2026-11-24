/** Origen visible de notas y consejos. Sin claves ni audio. */

export type AdviceSource = "gemini" | "template";

export type AdviceOrigin = {
  source: AdviceSource;
  model: string | null;
  reason: string | null;
};

export function originLabel(kind: "notas" | "consejos", origin: AdviceOrigin) {
  if (origin.source === "gemini") {
    const title = kind === "notas" ? "Notas generadas con Gemini" : "Consejos generados con Gemini";
    return origin.model ? `${title} (${origin.model})` : title;
  }
  const title = kind === "notas" ? "Notas básicas locales" : "Consejos básicos locales";
  return `${title} (no se pudo usar la IA: ${origin.reason || "no se pudo usar la IA"})`;
}

export function classifyModelFailure(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  if (/abort|tardaron demasiado|timeout|timed out/i.test(message)) return "se agotó el tiempo";
  if (/failed to fetch|network|econn|enotfound|socket/i.test(message)) return "no hay conexión";
  const status = Number(/(\d{3})/.exec(message)?.[1] ?? 0);
  if (status === 404 || status === 400 || status >= 500) return "el modelo no está disponible";
  if (/json|inválid|no devolvió texto/i.test(message)) return "respuesta inválida del modelo";
  return "respuesta inválida del modelo";
}

export function notesOrigin(input: {
  provider: string;
  hasKey: boolean;
  model: string;
  error?: unknown;
  empty?: boolean;
}): AdviceOrigin {
  if (input.provider === "template") {
    return { source: "template", model: null, reason: "el proveedor está en plantillas" };
  }
  if (!input.hasKey) {
    return { source: "template", model: input.model, reason: "no hay clave en el servidor" };
  }
  if (input.error) {
    return { source: "template", model: input.model, reason: classifyModelFailure(input.error) };
  }
  if (input.empty) {
    return { source: "template", model: input.model, reason: "respuesta inválida del modelo" };
  }
  return { source: "gemini", model: input.model, reason: null };
}

export function explainMissingTakes(input: {
  considered: number;
  kept: number;
  short: number;
  long: number;
}) {
  if (input.kept > 0) return null;
  if (input.considered === 0) return "no hubo tomas de audio válidas";
  if (input.short > 0 || input.long > 0) {
    return "las tomas duraron menos de 0,3 s o más de 15 s";
  }
  return "no hubo tomas de audio válidas";
}

export function formatAdviceLog(entry: {
  route: "notas" | "interpretacion";
  model: string;
  hasKey: boolean;
  takes: number;
  durationSec: number;
  latencyMs: number;
  result: "gemini" | "fallback";
  reason: string | null;
}) {
  const duration = Number.isFinite(entry.durationSec) ? entry.durationSec.toFixed(1) : "0.0";
  return [
    "[ensaya-ia]",
    `ruta=${entry.route}`,
    `modelo=${entry.model || "-"}`,
    `clave=${entry.hasKey ? "si" : "no"}`,
    `tomas=${entry.takes}`,
    `duracion_s=${duration}`,
    `latencia_ms=${Math.max(0, Math.round(entry.latencyMs))}`,
    `resultado=${entry.result}`,
    `motivo=${entry.reason ?? "-"}`,
  ].join(" ");
}

export function logAdvice(entry: Parameters<typeof formatAdviceLog>[0]) {
  console.info(formatAdviceLog(entry));
}
