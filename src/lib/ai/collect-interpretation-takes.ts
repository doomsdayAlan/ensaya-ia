import { listGrabacionesByScript, type StoredGrupoGrabacion } from "@/lib/grupo-recordings";
import { selectTakesForAnalysis } from "@/lib/ai/interpretation";
import type { InterpretationTakeInput } from "@/lib/ai/run-interpretation";

export type InterpretationLineDraft = {
  lineId: string;
  text: string;
  cue: string;
  baseEmotion: string;
  spoken: string;
};

function blobToBase64(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const raw = String(reader.result ?? "");
      const comma = raw.indexOf(",");
      resolve(comma >= 0 ? raw.slice(comma + 1) : raw);
    };
    reader.onerror = () => reject(reader.error ?? new Error("No se pudo leer la toma."));
    reader.readAsDataURL(blob);
  });
}

export async function collectInterpretationTakes(input: {
  scriptId: string;
  sceneId: string | null;
  grupoId: string;
  userId: string;
  sceneTitle?: string;
  lines: InterpretationLineDraft[];
}): Promise<{
  takes: InterpretationTakeInput[];
  notice: string | null;
  dropReason: string | null;
}> {
  const rows = await listGrabacionesByScript(input.scriptId);
  const byLine = new Map<string, StoredGrupoGrabacion>();
  for (const row of rows) {
    if (row.userId !== input.userId || row.grupoId !== input.grupoId) continue;
    if (input.sceneId && row.sceneId && row.sceneId !== input.sceneId) continue;
    if (!row.blob?.size) continue;
    byLine.set(row.lineId, row);
  }

  const candidates = input.lines.flatMap((line) => {
    const row = byLine.get(line.lineId);
    if (!row) return [];
    return [
      {
        ...line,
        durationSec: row.durationSec ?? 0,
        byteLength: row.blob.size,
        mimeType: row.mimeType || "audio/webm",
        blob: row.blob,
      },
    ];
  });

  const selection = selectTakesForAnalysis(candidates);
  const takes: InterpretationTakeInput[] = [];
  for (const take of selection.kept) {
    takes.push({
      lineId: take.lineId,
      text: take.text,
      cue: take.cue,
      baseEmotion: take.baseEmotion,
      spoken: take.spoken,
      sceneContext: input.sceneTitle?.trim() || "",
      durationSec: take.durationSec,
      mimeType: take.mimeType,
      audioBase64: await blobToBase64(take.blob),
    });
  }
  return { takes, notice: selection.notice, dropReason: selection.dropReason };
}
