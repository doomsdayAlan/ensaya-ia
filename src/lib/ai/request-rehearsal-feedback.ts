import { createServerFn } from "@tanstack/react-start";
import { runRehearsalFeedback } from "@/lib/ai/run-feedback";
import type { RehearsalFeedbackInput } from "@/lib/ai/types";

function parseFeedbackInput(data: unknown): RehearsalFeedbackInput {
  const row = data && typeof data === "object" ? (data as Record<string, unknown>) : {};
  const text = (value: unknown, fallback: string) =>
    typeof value === "string" && value.trim() ? value.trim().slice(0, 180) : fallback;
  const num = (value: unknown, fallback = 0) => {
    const n = typeof value === "number" ? value : Number(value);
    return Number.isFinite(n) ? n : fallback;
  };
  return {
    scriptTitle: text(row.scriptTitle, "Sin libreto"),
    sceneTitle: text(row.sceneTitle, "Sin escena"),
    characterName: text(row.characterName, "Actor"),
    memorization: Math.min(100, Math.max(0, num(row.memorization))),
    completed: Math.max(0, Math.round(num(row.completed))),
    total: Math.max(1, Math.round(num(row.total, 1))),
    skipped: Math.max(0, Math.round(num(row.skipped))),
    difficulty: Math.min(100, Math.max(0, num(row.difficulty, 50))),
  };
}

export const requestRehearsalFeedback = createServerFn({ method: "POST" })
  .inputValidator((data: RehearsalFeedbackInput) => parseFeedbackInput(data))
  .handler(async ({ data }) => runRehearsalFeedback(data));
