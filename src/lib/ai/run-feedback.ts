import { logAdvice, notesOrigin } from "@/lib/ai/advice-origin";
import { aiProviderName, aiTimeoutMs, geminiApiKey, geminiModel } from "@/lib/ai/env";
import { getRehearsalAiProvider } from "@/lib/ai/get-provider";
import { templateProvider } from "@/lib/ai/template-provider";
import type { RehearsalFeedbackInput, RehearsalFeedbackResult } from "@/lib/ai/types";

/** Resuelve con el primero que gane; el perdedor no puede cambiar el resultado. */
function withTimeout<T>(promise: Promise<T>, ms: number) {
  return new Promise<T>((resolve, reject) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      reject(new Error("Las notas del director tardaron demasiado."));
    }, ms);
    promise.then(
      (value) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        if (settled) return;
        settled = true;
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
  const localText = await templateProvider.generateFeedback(input);

  const finish = (
    origin: ReturnType<typeof notesOrigin>,
    text: string,
    source: RehearsalFeedbackResult["source"],
  ): RehearsalFeedbackResult => {
    logAdvice({
      route: "notas",
      model: origin.model ?? model,
      hasKey,
      takes: 0,
      durationSec: 0,
      latencyMs: Date.now() - started,
      result: source === "gemini" ? "gemini" : "fallback",
      reason: origin.reason,
    });
    // La fuente siempre coincide con el texto que se devuelve.
    return {
      text,
      source,
      model: origin.model,
      reason: origin.reason,
    };
  };

  const blocked = notesOrigin({ provider: providerName, hasKey, model });
  if (blocked.source !== "gemini") {
    return finish(blocked, localText, "local");
  }

  try {
    const provider = getRehearsalAiProvider();
    if (provider.id === "template") {
      return finish(
        notesOrigin({ provider: "template", hasKey: false, model }),
        localText,
        "local",
      );
    }
    const text = await withTimeout(provider.generateFeedback(input), aiTimeoutMs());
    const trimmed = text.trim();
    if (!trimmed) {
      return finish(
        notesOrigin({ provider: providerName, hasKey, model, empty: true }),
        localText,
        "local",
      );
    }
    return finish(
      {
        source: "gemini",
        model: provider.id === "gemini" ? model : provider.id,
        reason: null,
      },
      trimmed,
      "gemini",
    );
  } catch (error) {
    return finish(
      notesOrigin({ provider: providerName, hasKey, model, error }),
      localText,
      "local",
    );
  }
}
