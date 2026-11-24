import { logAdvice, notesOrigin } from "@/lib/ai/advice-origin";
import { aiProviderName, aiTimeoutMs, geminiApiKey, geminiModel } from "@/lib/ai/env";
import { getRehearsalAiProvider } from "@/lib/ai/get-provider";
import { templateProvider } from "@/lib/ai/template-provider";
import type { RehearsalFeedbackInput, RehearsalFeedbackResult } from "@/lib/ai/types";

function withTimeout<T>(promise: Promise<T>, ms: number) {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error("Las notas del director tardaron demasiado.")),
      ms,
    );
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

export async function runRehearsalFeedback(
  input: RehearsalFeedbackInput,
): Promise<RehearsalFeedbackResult> {
  const started = Date.now();
  const providerName = aiProviderName();
  const model = geminiModel();
  const hasKey = providerName === "gemini" ? Boolean(geminiApiKey()) : providerName !== "template";
  const fallback = await templateProvider.generateFeedback(input);
  const finish = (
    origin: ReturnType<typeof notesOrigin>,
    text: string,
    source: RehearsalFeedbackResult["source"],
  ) => {
    logAdvice({
      route: "notas",
      model: origin.model ?? model,
      hasKey,
      takes: 0,
      durationSec: 0,
      latencyMs: Date.now() - started,
      result: origin.source === "gemini" ? "gemini" : "fallback",
      reason: origin.reason,
    });
    return { text, source, model: origin.model, reason: origin.reason };
  };

  const blocked = notesOrigin({ provider: providerName, hasKey, model });
  if (blocked.source !== "gemini") {
    return finish(blocked, fallback, "template");
  }

  try {
    const provider = getRehearsalAiProvider();
    if (provider.id === "template") {
      return finish(
        notesOrigin({ provider: "template", hasKey: false, model }),
        fallback,
        "template",
      );
    }
    const text = await withTimeout(provider.generateFeedback(input), aiTimeoutMs());
    if (!text.trim()) {
      return finish(
        notesOrigin({ provider: providerName, hasKey, model, empty: true }),
        fallback,
        "template",
      );
    }
    return finish(
      { source: "gemini", model: provider.id === "gemini" ? model : provider.id, reason: null },
      text.trim(),
      provider.id,
    );
  } catch (error) {
    return finish(
      notesOrigin({ provider: providerName, hasKey, model, error }),
      fallback,
      "template",
    );
  }
}
