import { buildFeedback } from "@/lib/rehearsal-match";
import type { RehearsalAiProvider, RehearsalFeedbackInput } from "@/lib/ai/types";

export const templateProvider: RehearsalAiProvider = {
  id: "template",
  async generateFeedback(input: RehearsalFeedbackInput) {
    return buildFeedback({
      memorization: input.memorization,
      completed: input.completed,
      total: input.total,
      skipped: input.skipped,
    });
  },
};
