/**
 * Compara lo dicho con la linea del libreto.
 * Normaliza v/b y ll/y porque el reconocedor de Chrome en espanol las confunde.
 */
const STOP_WORDS = new Set([
  "que",
  "de",
  "la",
  "el",
  "en",
  "y",
  "a",
  "los",
  "las",
  "un",
  "una",
  "tu",
  "te",
  "me",
  "mi",
  "es",
  "no",
  "si",
  "por",
  "con",
  "del",
  "al",
  "se",
  "lo",
  "le",
  "o",
  "ya",
  "su",
  "sus",
]);

const EASY_THRESHOLD = 0.28;
const MEDIUM_THRESHOLD = 0.36;
const HARD_THRESHOLD = 0.48;
const CLOSE_RATIO = 0.7;

export type LineVerdict = {
  score: number;
  accepted: boolean;
  close: boolean;
  percent: number;
};

export type RehearsalScore = {
  memorization: number;
  clarity: number;
  expression: number;
  rhythm: number;
  projection: number;
  score: number;
};

/**
 * Uniformiza el texto hablado para compararlo con el libreto.
 * El STT del navegador suele confundir v/b y ll/y en español.
 */
export function normalizeSpeech(text: string) {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9ñ\s]/gi, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/v/g, "b")
    .replace(/ll/g, "y");
}

function levenshtein(a: string, b: string) {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;

  const rows = Array.from({ length: a.length + 1 }, (_, i) => i);
  for (let j = 1; j <= b.length; j += 1) {
    let previous = j - 1;
    rows[0] = j;
    for (let i = 1; i <= a.length; i += 1) {
      const current = rows[i];
      const substitutionCost = a[i - 1] === b[j - 1] ? 0 : 1;
      rows[i] = Math.min(rows[i] + 1, rows[i - 1] + 1, previous + substitutionCost);
      previous = current;
    }
  }
  return rows[a.length];
}

function contentWords(text: string) {
  return normalizeSpeech(text)
    .split(" ")
    .filter((word) => word.length > 2 && !STOP_WORDS.has(word));
}

function wordMatches(spoken: string, expected: string) {
  if (spoken === expected) return true;
  if (expected.length > 3 && spoken.includes(expected)) return true;
  if (spoken.length > 3 && expected.includes(spoken)) return true;
  const allowedEdits = expected.length <= 4 ? 1 : expected.length <= 7 ? 2 : 3;
  return levenshtein(spoken, expected) <= allowedEdits;
}

function coverageScore(spoken: string, expected: string) {
  const spokenWords = contentWords(spoken);
  const expectedWords = contentWords(expected);
  if (!expectedWords.length) return 0;

  const hits = expectedWords.filter((word) =>
    spokenWords.some((spokenWord) => wordMatches(spokenWord, word)),
  ).length;
  return hits / expectedWords.length;
}

/**
 * Devuelve 0..1. Tomamos el mejor de tres señales porque el microfono
 * rara vez entrega la linea literal: a veces solo llegan las palabras clave.
 */
export function lineSimilarity(spoken: string, expected: string) {
  const spokenNormalized = normalizeSpeech(spoken);
  const expectedNormalized = normalizeSpeech(expected);
  if (!spokenNormalized || !expectedNormalized) return 0;
  if (spokenNormalized === expectedNormalized) return 1;

  const shorter = Math.min(spokenNormalized.length, expectedNormalized.length);
  const longer = Math.max(spokenNormalized.length, expectedNormalized.length);
  const oneContainsTheOther =
    expectedNormalized.includes(spokenNormalized) || spokenNormalized.includes(expectedNormalized);
  const includeBonus = oneContainsTheOther ? Math.min(1, shorter / longer + 0.4) : 0;
  const levScore = longer ? 1 - levenshtein(spokenNormalized, expectedNormalized) / longer : 0;

  return Math.max(includeBonus, coverageScore(spoken, expected), levScore * 0.92);
}

export function matchThreshold(aiDifficulty: number) {
  if (aiDifficulty < 33) return EASY_THRESHOLD;
  if (aiDifficulty < 66) return MEDIUM_THRESHOLD;
  return HARD_THRESHOLD;
}

export function evaluateSpokenLine(spoken: string, expected: string, difficulty: number): LineVerdict {
  const score = lineSimilarity(spoken, expected);
  const needed = matchThreshold(difficulty);
  return {
    score,
    accepted: score >= needed,
    close: score >= needed * CLOSE_RATIO && score < needed,
    percent: Math.round(score * 100),
  };
}

export function scoreRehearsal(scores: number[], skipped: number): RehearsalScore {
  const memorization = scores.length
    ? Math.round((scores.reduce((sum, value) => sum + value, 0) / scores.length) * 100)
    : 0;
  const clarity = Math.min(100, memorization + 4);
  const expression = Math.max(40, memorization - 6);
  const rhythm = Math.max(35, 100 - skipped * 8);
  const projection = Math.min(100, 60 + Math.round(memorization * 0.3));
  const score = Math.round((memorization + clarity + expression + rhythm + projection) / 5);
  return { memorization, clarity, expression, rhythm, projection, score };
}

export function buildFeedback(params: {
  memorization: number;
  completed: number;
  total: number;
  skipped: number;
}) {
  const { memorization, completed, total, skipped } = params;
  if (completed === 0) return "Termina un ensayo hablando tus lineas para generar retroalimentacion.";
  if (memorization >= 80) {
    return "Muy buena memorizacion. La IA te siguio el ritmo y las coincidencias con el libreto fueron altas.";
  }
  if (memorization >= 60) {
    return "Buen avance. Recuerda las palabras clave de cada linea; puedes repetir la escena para fijar el texto.";
  }
  if (skipped > 0) {
    return `Completaste ${completed} de ${total} lineas. Hubo omisiones: vuelve a ensayar sin saltar para mejorar la continuidad.`;
  }
  return "Sigue practicando en voz alta. No hace falta recitar perfecto: la IA avanza cuando reconoce parte de tu linea.";
}
