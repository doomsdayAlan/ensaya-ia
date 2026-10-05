import { aiTimeoutMs } from "@/lib/ai/env";
import { getRehearsalAiProvider } from "@/lib/ai/get-provider";
import { templateProvider } from "@/lib/ai/template-provider";
import type { RehearsalFeedbackInput, RehearsalFeedbackResult } from "@/lib/ai/types";

function withTimeout<T>(promise: Promise<T>, ms: number) {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("La IA tardo demasiado.")), ms);
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

export async function runRehearsalFeedback(input: RehearsalFeedbackInput): Promise<RehearsalFeedbackResult> {
  const fallback = await templateProvider.generateFeedback(input);
  try {
    const provider = getRehearsalAiProvider();
    if (provider.id === "template") {
      return { text: fallback, source: "template" };
    }
    const text = await withTimeout(provider.generateFeedback(input), aiTimeoutMs());
    if (!text.trim()) return { text: fallback, source: "template" };
    return { text: text.trim(), source: provider.id };
  } catch {
    return { text: fallback, source: "template" };
  }
}
