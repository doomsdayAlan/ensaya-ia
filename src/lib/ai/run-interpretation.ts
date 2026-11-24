import { classifyModelFailure, logAdvice } from "@/lib/ai/advice-origin";
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
  sceneContext?: string;
  durationSec: number;
  mimeType: string;
  audioBase64: string;
};

const SYSTEM = `Eres el módulo de consejos de interpretación de ENSAYA IA.
Respondes en español de México, en un tono breve y respetuoso.
Son consejos orientativos. No eres maestro ni evaluación profesional. No calificas la actuación ni das un porcentaje.
No inventes líneas que la persona no dijo. Si el audio no se entiende, dilo.
No menciones nombres de proveedores, APIs ni modelos.
Por cada línea con audio, compara lo que se oye con el texto, la acotación, la emoción esperada y el contexto.
Devuelve solo JSON:
disclaimer (una frase de que son consejos orientativos),
lines: lineId, detectedExpressions (máximo 3, name y score de 0 a 1), expectedEmotion,
alignment (cercano, parcial, lejano o sin_audio),
intonation, pauses, volume, rhythm, intention (una frase concreta cada una),
tips (1 o 2 oraciones que reúnan esas observaciones).`;

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

function withOrigin(
  advice: InterpretationAdvice | null,
  origin: { source: "gemini" | "template"; model: string | null; reason: string | null },
) {
  if (!advice) return null;
  return {
    ...advice,
    source: origin.source,
    model: origin.model,
    reason: origin.reason ?? advice.reason,
  };
}

export async function runInterpretationAdvice(takes: InterpretationTakeInput[]): Promise<{
  advice: InterpretationAdvice | null;
}> {
  const started = Date.now();
  const model = interpretationModel();
  const apiKey = geminiApiKey();
  const sized = takes.map((take) => ({
    ...take,
    byteLength: Math.floor((take.audioBase64.length * 3) / 4),
  }));
  const selection = selectTakesForAnalysis(sized);
  const durationSec = selection.kept.reduce((sum, take) => sum + take.durationSec, 0);
  const finish = (
    advice: InterpretationAdvice | null,
    origin: { source: "gemini" | "template"; model: string | null; reason: string | null },
  ) => {
    logAdvice({
      route: "interpretacion",
      model,
      hasKey: Boolean(apiKey),
      takes: selection.kept.length,
      durationSec,
      latencyMs: Date.now() - started,
      result: origin.source === "gemini" ? "gemini" : "fallback",
      reason: origin.reason,
    });
    return { advice: withOrigin(advice, origin) };
  };

  if (!apiKey) {
    const reason = "no hay clave en el servidor";
    return finish(interpretationResult(null, reason), {
      source: "template",
      model,
      reason,
    });
  }

  if (selection.kept.length === 0) {
    const reason = selection.dropReason ?? "no hubo tomas de audio válidas";
    return finish(interpretationResult(null, reason), {
      source: "template",
      model,
      reason,
    });
  }

  const parts: Array<{ text: string } | { inlineData: { mimeType: string; data: string } }> = [];
  for (const take of selection.kept) {
    parts.push({
      text: [
        `lineId: ${take.lineId}`,
        `Texto esperado: ${take.text}`,
        `Acotación: ${take.cue || "ninguna"}`,
        `Emoción esperada: ${take.baseEmotion || "sin indicación"}`,
        `Contexto de la escena: ${take.sceneContext || "sin contexto"}`,
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
          maxOutputTokens: 4096,
          responseMimeType: "application/json",
        },
      }),
    });
    if (!response.ok) {
      const reason = classifyModelFailure(new Error(`El modelo respondió ${response.status}`));
      return finish(interpretationResult(null, reason), { source: "template", model, reason });
    }
    const text = extractText(await response.json());
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start < 0 || end <= start) {
      const reason = "respuesta inválida del modelo";
      return finish(interpretationResult(null, reason), { source: "template", model, reason });
    }
    let parsed: InterpretationAdvice | null = null;
    try {
      parsed = parseInterpretationPayload(
        JSON.parse(text.slice(start, end + 1)) as unknown,
        new Set(selection.kept.map((take) => take.lineId)),
      );
    } catch {
      parsed = null;
    }
    if (!parsed) {
      const reason = "respuesta inválida del modelo";
      return finish(interpretationResult(null, reason), { source: "template", model, reason });
    }
    const advice = interpretationResult(parsed, selection.notice);
    if (advice && !advice.disclaimer) advice.disclaimer = INTERPRETATION_DISCLAIMER;
    return finish(advice, { source: "gemini", model, reason: null });
  } catch (error) {
    const reason = classifyModelFailure(error);
    return finish(interpretationResult(null, reason), { source: "template", model, reason });
  } finally {
    clearTimeout(timer);
  }
}
