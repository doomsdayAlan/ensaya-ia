import {
  geminiApiKey,
  geminiModel,
  groqApiKey,
  groqModel,
  openaiApiKey,
  openaiModel,
} from "@/lib/ai/env";
import { getRehearsalAiProvider } from "@/lib/ai/get-provider";
import { segmentSystemPrompt, segmentUserPrompt } from "@/lib/ai/prompts";
import type {
  AiProviderId,
  ScriptSegmentInput,
  ScriptSegmentResult,
  SegmentedScriptScene,
} from "@/lib/ai/types";

const MAX_INPUT_CHARS = 14_000;
const SEGMENT_TIMEOUT_MS = 22_000;

function withTimeout<T>(promise: Promise<T>, ms: number) {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("La segmentación tardó demasiado.")), ms);
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

function extractGeminiText(payload: unknown) {
  if (!payload || typeof payload !== "object") return "";
  const candidates = (payload as { candidates?: unknown }).candidates;
  if (!Array.isArray(candidates) || !candidates[0] || typeof candidates[0] !== "object") return "";
  const content = (candidates[0] as { content?: { parts?: { text?: string }[] } }).content;
  const parts = content?.parts;
  if (!Array.isArray(parts)) return "";
  return parts
    .map((part) => part?.text ?? "")
    .join(" ")
    .trim();
}

function parseJsonObject(raw: string) {
  const trimmed = raw
    .trim()
    .replace(/^```(?:json)?/i, "")
    .replace(/```$/i, "")
    .trim();
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(trimmed.slice(start, end + 1)) as unknown;
  } catch {
    return null;
  }
}

function asString(value: unknown, max = 240) {
  if (typeof value !== "string") return "";
  return value.replace(/\s+/g, " ").trim().slice(0, max);
}

function normalizeCharacterKey(name: string) {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[.:\-–—]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
}

function canonicalName(name: string, aliases: Map<string, string>) {
  const key = normalizeCharacterKey(name);
  if (!key) return null;
  const prev = aliases.get(key);
  if (prev) return prev;
  const cleaned = name.replace(/\s+/g, " ").trim();
  aliases.set(key, cleaned);
  return cleaned;
}

export function parseScriptSegmentPayload(
  payload: unknown,
): Omit<ScriptSegmentResult, "source"> | null {
  if (!payload || typeof payload !== "object") return null;
  const row = payload as Record<string, unknown>;
  const aliases = new Map<string, string>();
  const listed = Array.isArray(row.characters) ? row.characters : [];
  for (const item of listed) {
    const name = typeof item === "string" ? item : asString((item as { name?: unknown })?.name, 40);
    if (name) canonicalName(name, aliases);
  }

  const rawScenes = Array.isArray(row.scenes) ? row.scenes.slice(0, 200) : [];
  const scenes: SegmentedScriptScene[] = [];
  for (const scene of rawScenes) {
    if (!scene || typeof scene !== "object") continue;
    const sceneRow = scene as Record<string, unknown>;
    const title = asString(sceneRow.title, 120) || `Escena ${scenes.length + 1}`;
    const location = asString(sceneRow.location, 80) || null;
    const rawLines = Array.isArray(sceneRow.lines) ? sceneRow.lines.slice(0, 2000) : [];
    const lines: SegmentedScriptScene["lines"] = [];
    for (const line of rawLines) {
      if (!line || typeof line !== "object") continue;
      const lineRow = line as Record<string, unknown>;
      const text = asString(lineRow.text, 4000);
      if (!text) continue;
      const rawName = asString(lineRow.character ?? lineRow.characterName, 40);
      const characterName = rawName ? canonicalName(rawName, aliases) : null;
      const cueField = asString(
        lineRow.cue ?? lineRow.parenthetical ?? lineRow.stageDirection,
        400,
      );
      const leading = text.match(/^\(([^)]{1,180})\)\s*/);
      const spoken = leading ? text.slice(leading[0].length).trim() : text;
      const cue =
        [cueField, leading?.[1]?.trim()].filter((part) => Boolean(part)).join(" · ") || null;
      if (!spoken) {
        const previous = lines[lines.length - 1];
        if (previous && cue) previous.cue = previous.cue ? `${previous.cue} · ${cue}` : cue;
        continue;
      }
      lines.push({ characterName, text: spoken, cue });
    }
    if (lines.length) scenes.push({ title, location, lines });
  }
  if (!scenes.length) return null;

  const fromLines = scenes.flatMap((scene) =>
    scene.lines.map((line) => line.characterName).filter((name): name is string => Boolean(name)),
  );
  const characters = Array.from(new Set([...aliases.values(), ...fromLines]));
  return {
    title: asString(row.title, 120) || null,
    characters,
    scenes,
  };
}

async function generateGeminiJson(input: ScriptSegmentInput) {
  const apiKey = geminiApiKey();
  if (!apiKey) return null;
  const model = geminiModel();
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: segmentSystemPrompt() }] },
      contents: [{ role: "user", parts: [{ text: segmentUserPrompt(input) }] }],
      generationConfig: {
        temperature: 0.2,
        maxOutputTokens: 8192,
        responseMimeType: "application/json",
      },
    }),
  });
  if (!response.ok) throw new Error(`El modelo de lenguaje respondió ${response.status}`);
  return parseJsonObject(extractGeminiText(await response.json()));
}

async function generateOpenAiJson(options: {
  id: Exclude<AiProviderId, "template" | "gemini">;
  apiKey: string;
  model: string;
  baseUrl: string;
  input: ScriptSegmentInput;
}) {
  const response = await fetch(`${options.baseUrl.replace(/\/$/, "")}/chat/completions`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${options.apiKey}`,
    },
    body: JSON.stringify({
      model: options.model,
      temperature: 0.2,
      max_tokens: 4096,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: segmentSystemPrompt() },
        { role: "user", content: segmentUserPrompt(options.input) },
      ],
    }),
  });
  if (!response.ok) throw new Error(`${options.id} respondió ${response.status}`);
  const payload = (await response.json()) as {
    choices?: { message?: { content?: string } }[];
  };
  return parseJsonObject(payload.choices?.[0]?.message?.content ?? "");
}

export async function runScriptSegment(
  input: ScriptSegmentInput,
): Promise<ScriptSegmentResult | null> {
  const rawText = input.rawText.replace(/\r\n/g, "\n").trim();
  if (rawText.replace(/\s+/g, " ").length < 20) return null;
  // Un recorte no es el libreto completo: el llamador debe completar con el parser local.
  if (rawText.length > MAX_INPUT_CHARS) return null;
  const clipped: ScriptSegmentInput = {
    title: input.title,
    rawText,
  };

  const provider = getRehearsalAiProvider();
  if (provider.id === "template") return null;

  const json = await withTimeout(
    provider.id === "groq"
      ? generateOpenAiJson({
          id: "groq",
          apiKey: groqApiKey(),
          model: groqModel(),
          baseUrl: "https://api.groq.com/openai/v1",
          input: clipped,
        })
      : provider.id === "openai"
        ? generateOpenAiJson({
            id: "openai",
            apiKey: openaiApiKey(),
            model: openaiModel(),
            baseUrl: "https://api.openai.com/v1",
            input: clipped,
          })
        : generateGeminiJson(clipped),
    SEGMENT_TIMEOUT_MS,
  );
  const parsed = parseScriptSegmentPayload(json);
  if (!parsed) return null;
  return { ...parsed, source: provider.id };
}
