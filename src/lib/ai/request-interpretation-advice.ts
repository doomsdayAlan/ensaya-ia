import { createServerFn } from "@tanstack/react-start";
import { runInterpretationAdvice, type InterpretationTakeInput } from "@/lib/ai/run-interpretation";

function text(value: unknown, max: number) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function parseTakes(data: unknown): InterpretationTakeInput[] {
  const row = data && typeof data === "object" ? (data as { takes?: unknown }).takes : null;
  if (!Array.isArray(row)) return [];
  const takes: InterpretationTakeInput[] = [];
  for (const item of row.slice(0, 24)) {
    if (!item || typeof item !== "object") continue;
    const take = item as Record<string, unknown>;
    const audioBase64 = text(take.audioBase64, 24_000_000);
    if (!audioBase64) continue;
    const duration =
      typeof take.durationSec === "number" ? take.durationSec : Number(take.durationSec);
    takes.push({
      lineId: text(take.lineId, 80),
      text: text(take.text, 800),
      cue: text(take.cue, 240),
      baseEmotion: text(take.baseEmotion, 80),
      spoken: text(take.spoken, 800),
      sceneContext: text(take.sceneContext, 160),
      durationSec: Number.isFinite(duration) ? duration : 0,
      mimeType: text(take.mimeType, 80) || "audio/webm",
      audioBase64,
    });
  }
  return takes;
}

export const requestInterpretationAdvice = createServerFn({ method: "POST" })
  .inputValidator((data: { takes: InterpretationTakeInput[] }) => ({ takes: parseTakes(data) }))
  .handler(async ({ data }) => runInterpretationAdvice(data.takes));
