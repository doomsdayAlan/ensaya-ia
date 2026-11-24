/** Recorte del historial local. No guarda audio. */

export type HistoryLineNote = {
  lineId: string;
  order: number;
  characterName: string;
  text: string;
  skipped: boolean;
  score: number | null;
  spoken?: string | null;
  attempt?: number | null;
  failed?: boolean;
  unreached?: boolean;
};

export type HistoryInterpretation = {
  disclaimer: string;
  notice: string | null;
  lines: Array<{
    lineId: string;
    detectedExpressions: Array<{ name: string; score: number }>;
    expectedEmotion: string;
    alignment: string;
    tips: string;
  }>;
};

const HISTORY_JSON_BUDGET = 180_000;

export function compactHistoryDetail(report: {
  lineNotes?: HistoryLineNote[];
  interpretation?: HistoryInterpretation | null;
}) {
  const lineNotes = (report.lineNotes ?? []).slice(0, 80).map((note) => trimNote(note, 500));
  let interpretation = trimInterpretation(report.interpretation ?? null, 400);
  let packed = JSON.stringify({ lineNotes, interpretation });
  if (packed.length > HISTORY_JSON_BUDGET) {
    interpretation = trimInterpretation(interpretation, 120);
    packed = JSON.stringify({
      lineNotes: lineNotes.map((note) => trimNote(note, 180)),
      interpretation,
    });
  }
  return JSON.parse(packed) as {
    lineNotes: HistoryLineNote[];
    interpretation: HistoryInterpretation | null;
  };
}

function trimNote(note: HistoryLineNote, max: number): HistoryLineNote {
  return {
    ...note,
    text: note.text.slice(0, max),
    spoken: note.spoken ? note.spoken.slice(0, max) : note.spoken,
    characterName: note.characterName.slice(0, 80),
  };
}

function trimInterpretation(block: HistoryInterpretation | null, tipMax: number) {
  if (!block) return null;
  return {
    disclaimer: block.disclaimer.slice(0, 240),
    notice: block.notice ? block.notice.slice(0, 240) : null,
    lines: block.lines.slice(0, 40).map((line) => ({
      ...line,
      expectedEmotion: line.expectedEmotion.slice(0, 80),
      tips: line.tips.slice(0, tipMax),
      detectedExpressions: line.detectedExpressions.slice(0, 3),
    })),
  };
}
