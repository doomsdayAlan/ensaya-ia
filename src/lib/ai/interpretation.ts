/** Consejos de interpretación a partir de audio. No cambia el puntaje de texto. */

export const TERMS_VERSION = "2026-11-24";

export const INTERPRETATION_DISCLAIMER =
  "Consejos orientativos. No sustituyen la dirección escénica ni califican la actuación.";

export const INTERPRETATION_LIMITS = {
  maxTakes: 20,
  maxTakeSec: 15,
  maxTotalSec: 180,
  minTakeSec: 0.3,
  maxBytes: 18_000_000,
} as const;

const ALIGNMENTS = ["cercano", "parcial", "lejano", "sin_audio"] as const;

export type InterpretationAlignment = (typeof ALIGNMENTS)[number];

export type DetectedExpression = {
  name: string;
  score: number;
};

export type InterpretationLine = {
  lineId: string;
  detectedExpressions: DetectedExpression[];
  expectedEmotion: string;
  alignment: InterpretationAlignment;
  tips: string;
  intonation?: string;
  pauses?: string;
  volume?: string;
  rhythm?: string;
  intention?: string;
};

export type InterpretationAdvice = {
  disclaimer: string;
  lines: InterpretationLine[];
  notice: string | null;
  source: "gemini" | "template";
  model: string | null;
  reason: string | null;
};

export type TakeCandidate = {
  lineId: string;
  durationSec: number;
  byteLength: number;
};

export type TakeSelection<T extends TakeCandidate = TakeCandidate> = {
  kept: T[];
  analyzed: number;
  considered: number;
  notice: string | null;
  dropReason: string | null;
};

export function shouldRequestInterpretation(input: {
  mode: string;
  termsAccepted: boolean;
  audioEnabled: boolean;
  offline: boolean;
  hasTakes: boolean;
}) {
  return (
    input.mode !== "lectura" &&
    input.termsAccepted &&
    input.audioEnabled &&
    !input.offline &&
    input.hasTakes
  );
}

/** Si el reloj guardó 0,1 s pero el audio pesa como una toma real, no se descarta. */
export function measuredTakeSeconds(durationSec: number | null | undefined, byteLength: number) {
  const known = typeof durationSec === "number" && Number.isFinite(durationSec) ? durationSec : 0;
  if (known > INTERPRETATION_LIMITS.maxTakeSec) return known;
  if (known >= INTERPRETATION_LIMITS.minTakeSec) return known;
  if (byteLength >= 2_000) {
    return Math.min(INTERPRETATION_LIMITS.maxTakeSec, Math.max(0.3, byteLength / 4_000));
  }
  return known;
}

export function selectTakesForAnalysis<T extends TakeCandidate>(takes: T[]): TakeSelection<T> {
  const considered = takes.length;
  const kept: T[] = [];
  let totalSec = 0;
  let totalBytes = 0;
  let short = 0;
  let long = 0;
  let skipped = 0;

  for (const take of takes) {
    const durationSec = measuredTakeSeconds(take.durationSec, take.byteLength);
    const sized = { ...take, durationSec };
    if (!sized.lineId || sized.byteLength <= 0 || durationSec < INTERPRETATION_LIMITS.minTakeSec) {
      short += durationSec < INTERPRETATION_LIMITS.minTakeSec ? 1 : 0;
      skipped += 1;
      continue;
    }
    if (durationSec > INTERPRETATION_LIMITS.maxTakeSec) {
      long += 1;
      skipped += 1;
      continue;
    }
    if (kept.length >= INTERPRETATION_LIMITS.maxTakes) {
      skipped += 1;
      continue;
    }
    if (totalSec + durationSec > INTERPRETATION_LIMITS.maxTotalSec) {
      skipped += 1;
      continue;
    }
    if (totalBytes + take.byteLength > INTERPRETATION_LIMITS.maxBytes) {
      skipped += 1;
      continue;
    }
    kept.push(sized);
    totalSec += durationSec;
    totalBytes += sized.byteLength;
  }

  const notice =
    kept.length > 0 && kept.length < considered
      ? `Se analizaron ${kept.length} de ${considered} líneas para no exceder el límite.`
      : null;
  const dropReason =
    kept.length === 0
      ? considered === 0
        ? "no hubo tomas de audio válidas"
        : short > 0 || long > 0
          ? "las tomas duraron menos de 0,3 s o más de 15 s"
          : "no hubo tomas de audio válidas"
      : null;

  return {
    kept,
    analyzed: kept.length,
    considered,
    notice: skipped > 0 && kept.length > 0 ? notice : null,
    dropReason,
  };
}

function clampScore(value: unknown) {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return null;
  if (n > 1 && n <= 100) {
    if (n < 2) return 1;
    return Math.round((n / 100) * 1000) / 1000;
  }
  return Math.min(1, Math.max(0, n));
}

function asAlignment(value: unknown): InterpretationAlignment {
  return ALIGNMENTS.includes(value as InterpretationAlignment)
    ? (value as InterpretationAlignment)
    : "parcial";
}

export function parseInterpretationPayload(
  raw: unknown,
  knownLineIds: ReadonlySet<string>,
): InterpretationAdvice | null {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as Record<string, unknown>;
  if (!Array.isArray(row.lines)) return null;

  const lines: InterpretationLine[] = [];
  for (const item of row.lines) {
    if (!item || typeof item !== "object") continue;
    const line = item as Record<string, unknown>;
    const lineId = typeof line.lineId === "string" ? line.lineId.trim() : "";
    if (!lineId || !knownLineIds.has(lineId)) continue;

    const expressions: DetectedExpression[] = [];
    if (Array.isArray(line.detectedExpressions)) {
      for (const entry of line.detectedExpressions) {
        if (!entry || typeof entry !== "object") continue;
        const name =
          typeof (entry as { name?: unknown }).name === "string"
            ? (entry as { name: string }).name.trim().slice(0, 40)
            : "";
        const score = clampScore((entry as { score?: unknown }).score);
        if (!name || score === null) continue;
        expressions.push({ name, score });
      }
    }
    expressions.sort((a, b) => b.score - a.score);

    const tips = typeof line.tips === "string" ? line.tips.replace(/\s+/g, " ").trim() : "";
    const note = (value: unknown) =>
      typeof value === "string" && value.trim()
        ? value.replace(/\s+/g, " ").trim().slice(0, 180)
        : undefined;
    lines.push({
      lineId,
      detectedExpressions: expressions.slice(0, 3),
      expectedEmotion:
        typeof line.expectedEmotion === "string" && line.expectedEmotion.trim()
          ? line.expectedEmotion.trim().slice(0, 80)
          : "Sin emoción indicada",
      alignment: asAlignment(line.alignment),
      tips: tips.slice(0, 400),
      intonation: note(line.intonation),
      pauses: note(line.pauses),
      volume: note(line.volume),
      rhythm: note(line.rhythm),
      intention: note(line.intention),
    });
  }

  if (lines.length === 0) return null;

  const disclaimer =
    typeof row.disclaimer === "string" && row.disclaimer.trim()
      ? row.disclaimer.trim().slice(0, 240)
      : INTERPRETATION_DISCLAIMER;

  return { disclaimer, lines, notice: null, source: "gemini", model: null, reason: null };
}

/** Sin audio útil o sin respuesta válida no se inventan expresiones. */
export function interpretationResult(
  parsed: InterpretationAdvice | null,
  notice: string | null,
): InterpretationAdvice | null {
  if (!parsed && !notice) return null;
  if (!parsed) {
    return {
      disclaimer: INTERPRETATION_DISCLAIMER,
      lines: [],
      notice,
      source: "template",
      model: null,
      reason: notice,
    };
  }
  return {
    ...parsed,
    notice: notice ?? parsed.notice,
    source: parsed.source ?? "gemini",
    model: parsed.model ?? null,
    reason: parsed.reason ?? null,
  };
}
