import { AZURE_VOICES, findAzureVoice, type AzureVoice } from "@/lib/azure-voices";

const MAX_TEXT = 1000;

let regionVoiceNames: Set<string> | null = null;

function readSecret(name: "AZURE_SPEECH_KEY" | "AZURE_SPEECH_REGION") {
  if (typeof process === "undefined" || !process.env) return "";
  return process.env[name]?.trim() ?? "";
}

function speechRegion() {
  const region = readSecret("AZURE_SPEECH_REGION").toLowerCase();
  return /^[a-z0-9-]+$/.test(region) ? region : "";
}

function escapeXml(text: string) {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function prosodyValue(value: number) {
  const safe = Number.isFinite(value) ? Math.min(2, Math.max(0.5, value)) : 1;
  const percent = Math.round((safe - 1) * 100);
  return `${percent >= 0 ? "+" : ""}${percent}%`;
}

async function loadRegionVoiceNames() {
  if (regionVoiceNames) return regionVoiceNames;
  const key = readSecret("AZURE_SPEECH_KEY");
  const region = speechRegion();
  if (!key || !region) return null;
  const response = await fetch(
    `https://${region}.tts.speech.microsoft.com/cognitiveservices/voices/list`,
    { headers: { "Ocp-Apim-Subscription-Key": key } },
  );
  if (!response.ok) return null;
  const list = (await response.json()) as Array<{ ShortName?: string }>;
  const names = new Set(
    list.map((voice) => voice.ShortName).filter((name): name is string => Boolean(name)),
  );
  regionVoiceNames = names;
  return names;
}

export async function listAvailableAzureVoices(): Promise<AzureVoice[]> {
  const names = await loadRegionVoiceNames();
  if (!names) return [];
  return AZURE_VOICES.filter((voice) => names.has(voice.id)).map((voice) => ({ ...voice }));
}

export async function synthesizeAzureMp3(input: {
  texto: string;
  voiceId: string;
  velocidad: number;
  tono: number;
}) {
  const text = input.texto.trim();
  const voice = findAzureVoice(input.voiceId);
  if (!voice || voice.id !== input.voiceId || text.length === 0 || text.length > MAX_TEXT) {
    return null;
  }
  const names = await loadRegionVoiceNames();
  if (!names || !names.has(voice.id)) return null;
  const key = readSecret("AZURE_SPEECH_KEY");
  const region = speechRegion();
  if (!key || !region) return null;

  const ssml = `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="${voice.locale}"><voice name="${voice.id}"><prosody rate="${prosodyValue(input.velocidad)}" pitch="${prosodyValue(input.tono)}">${escapeXml(text)}</prosody></voice></speak>`;
  const response = await fetch(`https://${region}.tts.speech.microsoft.com/cognitiveservices/v1`, {
    method: "POST",
    headers: {
      "Ocp-Apim-Subscription-Key": key,
      "Content-Type": "application/ssml+xml",
      "X-Microsoft-OutputFormat": "audio-24khz-48kbitrate-mono-mp3",
      "User-Agent": "EnsayaIA",
    },
    body: ssml,
  });
  if (!response.ok) return null;
  const bytes = new Uint8Array(await response.arrayBuffer());
  let binary = "";
  const step = 0x8000;
  for (let index = 0; index < bytes.length; index += step) {
    binary += String.fromCharCode(...bytes.subarray(index, index + step));
  }
  return btoa(binary);
}
