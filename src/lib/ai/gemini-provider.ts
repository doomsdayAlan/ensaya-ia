import { geminiApiKey, geminiModel } from "@/lib/ai/env";
import { feedbackSystemPrompt, feedbackUserPrompt } from "@/lib/ai/prompts";
import type { RehearsalAiProvider, RehearsalFeedbackInput } from "@/lib/ai/types";

function extractText(payload: unknown) {
  if (!payload || typeof payload !== "object") return "";
  const candidates = (payload as { candidates?: unknown }).candidates;
  if (!Array.isArray(candidates) || !candidates[0] || typeof candidates[0] !== "object") return "";
  const content = (candidates[0] as { content?: { parts?: { text?: string }[] } }).content;
  const parts = content?.parts;
  if (!Array.isArray(parts)) return "";
  return parts
    .map((part) => part?.text ?? "")
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

export function createGeminiProvider(): RehearsalAiProvider | null {
  const apiKey = geminiApiKey();
  if (!apiKey) return null;
  const model = geminiModel();

  return {
    id: "gemini",
    async generateFeedback(input: RehearsalFeedbackInput) {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;
      const response = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: feedbackSystemPrompt() }] },
          contents: [{ role: "user", parts: [{ text: feedbackUserPrompt(input) }] }],
          generationConfig: { temperature: 0.6, maxOutputTokens: 400 },
        }),
      });
      if (!response.ok) {
        throw new Error(`Gemini respondio ${response.status}`);
      }
      const text = extractText(await response.json());
      if (!text) throw new Error("Gemini no devolvio texto.");
      return text;
    },
  };
}
