import { geminiApiKey, interpretationModel, interpretationTimeoutMs } from "@/lib/ai/env";
import {
  INTERPRETATION_DISCLAIMER,
  interpretationResult,
  parseInterpretationPayload,
  selectTakesForAnalysis,
  type InterpretationAdvice,
} from "@/lib/ai/interpretation";

export type InterpretationTakeInput = {
  lineId: string;
  text: string;
  cue: string;
  baseEmotion: string;
  spoken: string;
  durationSec: number;
  mimeType: string;
  audioBase64: string;
};

const SYSTEM = `Eres el módulo de consejos de interpretación de ENSAYA IA.
Respondes en español de México, en un tono breve y respetuoso.
No eres maestro ni evaluación profesional. No calificas la actuación ni das un porcentaje de interpretación.
No inventes líneas que la persona no dijo. Si el audio no se entiende, dilo.
No menciones nombres de proveedores, APIs ni modelos.
Devuelve solo JSON con disclaimer, y lines: lineId, detectedExpressions (máximo 3, score de 0 a 1), expectedEmotion, alignment (cercano, parcial, lejano o sin_audio) y tips (1 o 2 oraciones).`;

function mimeForAudio(mime: string) {
  const base = mime.split(";")[0]?.trim().toLowerCase() ?? "";
  if (
    base === "audio/opus" ||
    base === "audio/webm" ||
    base === "audio/ogg" ||
    base === "audio/mp4"
  ) {
    return base;
  }
  return "audio/webm";
}

function extractText(payload: unknown) {
  if (!payload || typeof payload !== "object") return "";
  const candidates = (payload as { candidates?: unknown }).candidates;
  if (!Array.isArray(candidates) || !candidates[0] || typeof candidates[0] !== "object") return "";
  const parts = (candidates[0] as { content?: { parts?: { text?: string }[] } }).content?.parts;
  if (!Array.isArray(parts)) return "";
  return parts.map((part) => part?.text ?? "").join("\n");
}

export async function runInterpretationAdvice(takes: InterpretationTakeInput[]): Promise<{
  advice: InterpretationAdvice | null;
}> {
  const apiKey = geminiApiKey();
  if (!apiKey) {
    return {
      advice: interpretationResult(null, "No hubo consejos de interpretación."),
    };
  }

  const sized = takes.map((take) => ({
    ...take,
    byteLength: Math.floor((take.audioBase64.length * 3) / 4),
  }));
  const selection = selectTakesForAnalysis(sized);
  if (selection.kept.length === 0) {
    return {
      advice: interpretationResult(null, selection.notice ?? "No hubo consejos de interpretación."),
    };
  }

  const parts: Array<{ text: string } | { inlineData: { mimeType: string; data: string } }> = [];
  for (const take of selection.kept) {
    parts.push({
      text: [
        `lineId: ${take.lineId}`,
        `Texto esperado: ${take.text}`,
        `Acotación: ${take.cue || "ninguna"}`,
        `Emoción esperada: ${take.baseEmotion || "sin indicación"}`,
        `Transcripción de lo dicho: ${take.spoken || "sin transcripción"}`,
      ].join("\n"),
    });
    parts.push({
      inlineData: {
        mimeType: mimeForAudio(take.mimeType),
        data: take.audioBase64,
      },
    });
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), interpretationTimeoutMs());
  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(interpretationModel())}:generateContent`;
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-goog-api-key": apiKey,
      },
      signal: controller.signal,
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: SYSTEM }] },
        contents: [{ role: "user", parts }],
        generationConfig: {
          temperature: 0.4,
          maxOutputTokens: 2048,
          responseMimeType: "application/json",
        },
      }),
    });
    if (!response.ok) {
      return { advice: interpretationResult(null, "No hubo consejos de interpretación.") };
    }
    const text = extractText(await response.json());
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start < 0 || end <= start) {
      return { advice: interpretationResult(null, "No hubo consejos de interpretación.") };
    }
    const parsed = parseInterpretationPayload(
      JSON.parse(text.slice(start, end + 1)) as unknown,
      new Set(selection.kept.map((take) => take.lineId)),
    );
    const advice = interpretationResult(
      parsed,
      parsed ? selection.notice : "No hubo consejos de interpretación.",
    );
    if (advice && !advice.disclaimer) advice.disclaimer = INTERPRETATION_DISCLAIMER;
    return { advice };
  } catch {
    return { advice: interpretationResult(null, "No hubo consejos de interpretación.") };
  } finally {
    clearTimeout(timer);
  }
}
