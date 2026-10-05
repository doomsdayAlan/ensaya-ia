import { aiProviderName, groqApiKey, groqModel, openaiApiKey, openaiModel } from "@/lib/ai/env";
import { createGeminiProvider } from "@/lib/ai/gemini-provider";
import { createOpenAiCompatibleProvider } from "@/lib/ai/openai-compatible-provider";
import { templateProvider } from "@/lib/ai/template-provider";
import type { RehearsalAiProvider } from "@/lib/ai/types";

/** Elige el motor por AI_PROVIDER. Si falta la clave, usa plantillas locales. */
export function getRehearsalAiProvider(): RehearsalAiProvider {
  const name = aiProviderName();
  if (name === "template") return templateProvider;
  if (name === "groq") {
    return (
      createOpenAiCompatibleProvider({
        id: "groq",
        apiKey: groqApiKey(),
        model: groqModel(),
        baseUrl: "https://api.groq.com/openai/v1",
      }) ?? templateProvider
    );
  }
  if (name === "openai") {
    return (
      createOpenAiCompatibleProvider({
        id: "openai",
        apiKey: openaiApiKey(),
        model: openaiModel(),
        baseUrl: "https://api.openai.com/v1",
      }) ?? templateProvider
    );
  }
  return createGeminiProvider() ?? templateProvider;
}
