import { feedbackSystemPrompt, feedbackUserPrompt } from "@/lib/ai/prompts";
import type { AiProviderId, RehearsalAiProvider, RehearsalFeedbackInput } from "@/lib/ai/types";

export function createOpenAiCompatibleProvider(options: {
  id: AiProviderId;
  apiKey: string;
  model: string;
  baseUrl: string;
}): RehearsalAiProvider | null {
  if (!options.apiKey) return null;

  return {
    id: options.id,
    async generateFeedback(input: RehearsalFeedbackInput) {
      const response = await fetch(`${options.baseUrl.replace(/\/$/, "")}/chat/completions`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${options.apiKey}`,
        },
        body: JSON.stringify({
          model: options.model,
          temperature: 0.6,
          max_tokens: 400,
          messages: [
            { role: "system", content: feedbackSystemPrompt() },
            { role: "user", content: feedbackUserPrompt(input) },
          ],
        }),
      });
      if (!response.ok) {
        throw new Error(`${options.id} respondio ${response.status}`);
      }
      const payload = (await response.json()) as {
        choices?: { message?: { content?: string } }[];
      };
      const text = payload.choices?.[0]?.message?.content?.replace(/\s+/g, " ").trim() ?? "";
      if (!text) throw new Error(`${options.id} no devolvio texto.`);
      return text;
    },
  };
}
