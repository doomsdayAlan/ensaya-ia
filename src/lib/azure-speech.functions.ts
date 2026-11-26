import { createServerFn } from "@tanstack/react-start";
import { listAvailableAzureVoices, synthesizeAzureMp3 } from "@/lib/azure-speech.server";
import type { AzureVoice } from "@/lib/azure-voices";

function numberInRange(value: unknown, fallback: number) {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(2, Math.max(0.5, parsed));
}

export const listAzureCatalogVoices = createServerFn({ method: "GET" }).handler(
  async (): Promise<AzureVoice[]> => listAvailableAzureVoices(),
);

export const synthesizeAzureSpeech = createServerFn({ method: "POST" })
  .inputValidator((data: { texto: string; voiceId: string; velocidad: number; tono: number }) => {
    const row =
      data && typeof data === "object" ? data : { texto: "", voiceId: "", velocidad: 1, tono: 1 };
    return {
      texto: typeof row.texto === "string" && row.texto.length <= 1000 ? row.texto : "",
      voiceId: typeof row.voiceId === "string" ? row.voiceId.slice(0, 80) : "",
      velocidad: numberInRange(row.velocidad, 1),
      tono: numberInRange(row.tono, 1),
    };
  })
  .handler(async ({ data }) => {
    const audioBase64 = await synthesizeAzureMp3(data);
    return audioBase64 ? { audioBase64 } : null;
  });
