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
};

export type InterpretationAdvice = {
  disclaimer: string;
  lines: InterpretationLine[];
  notice: string | null;
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

export function selectTakesForAnalysis<T extends TakeCandidate>(takes: T[]): TakeSelection<T> {
  const considered = takes.length;
  const kept: T[] = [];
  let totalSec = 0;
  let totalBytes = 0;
  let skipped = 0;

  for (const take of takes) {
    if (
      !take.lineId ||
      take.byteLength <= 0 ||
      take.durationSec < INTERPRETATION_LIMITS.minTakeSec
    ) {
      skipped += 1;
      continue;
    }
    if (take.durationSec > INTERPRETATION_LIMITS.maxTakeSec) {
      skipped += 1;
      continue;
    }
    if (kept.length >= INTERPRETATION_LIMITS.maxTakes) {
      skipped += 1;
      continue;
    }
    if (totalSec + take.durationSec > INTERPRETATION_LIMITS.maxTotalSec) {
      skipped += 1;
      continue;
    }
    if (totalBytes + take.byteLength > INTERPRETATION_LIMITS.maxBytes) {
      skipped += 1;
      continue;
    }
    kept.push(take);
    totalSec += take.durationSec;
    totalBytes += take.byteLength;
  }

  const notice =
    kept.length < considered
      ? `Se analizaron ${kept.length} de ${considered} líneas para no exceder el límite.`
      : null;

  return { kept, analyzed: kept.length, considered, notice: skipped > 0 ? notice : null };
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
    lines.push({
      lineId,
      detectedExpressions: expressions.slice(0, 3),
      expectedEmotion:
        typeof line.expectedEmotion === "string" && line.expectedEmotion.trim()
          ? line.expectedEmotion.trim().slice(0, 80)
          : "Sin emoción indicada",
      alignment: asAlignment(line.alignment),
      tips: tips.slice(0, 400),
    });
  }

  if (lines.length === 0) return null;

  const disclaimer =
    typeof row.disclaimer === "string" && row.disclaimer.trim()
      ? row.disclaimer.trim().slice(0, 240)
      : INTERPRETATION_DISCLAIMER;

  return { disclaimer, lines, notice: null };
}

/** Sin audio útil o sin respuesta válida no se inventan expresiones. */
export function interpretationResult(
  parsed: InterpretationAdvice | null,
  notice: string | null,
): InterpretationAdvice | null {
  if (!parsed && !notice) return null;
  if (!parsed) {
    return { disclaimer: INTERPRETATION_DISCLAIMER, lines: [], notice };
  }
  return { ...parsed, notice: notice ?? parsed.notice };
}
