import { toast } from "sonner";
import { synthesizeAzureSpeech, listAzureCatalogVoices } from "@/lib/azure-speech.functions";
import { findAzureVoice, type AzureVoice, type VoiceGender } from "@/lib/azure-voices";
import { speakWithBrowser } from "@/lib/rehearsal-ai";

export const VOICE_PREVIEW_TEXT = "Hola, soy tu director, te daré retroalimentación al finalizar";
export const DEFAULT_SPEECH_RATE = 0.92;
export const DEFAULT_SPEECH_PITCH = 1.02;

const sessionAudio = new Map<string, string>();
const previewListeners = new Set<(voice: string | null) => void>();

let playback: HTMLAudioElement | null = null;
let playbackReject: ((error: Error) => void) | null = null;
let playbackToken = 0;
let previewGeneration = 0;
let warnedFallback = false;
let activePreview: string | null = null;

export function isSpeechCancelled(error: unknown) {
  return error instanceof Error && error.name === "SpeechCancelled";
}

function cancelled() {
  const error = new Error("Lectura detenida");
  error.name = "SpeechCancelled";
  return error;
}

function warnFallback() {
  if (warnedFallback) return;
  warnedFallback = true;
  toast.message("Sin conexión con voces naturales, usando voces del sistema", {
    id: "azure-voice-fallback",
  });
}

export function subscribeVoicePreview(listener: (voice: string | null) => void) {
  previewListeners.add(listener);
  listener(activePreview);
  return () => previewListeners.delete(listener);
}

function setPreview(voice: string | null) {
  activePreview = voice;
  previewListeners.forEach((listener) => listener(voice));
}

function matchesGender(name: string, gender: VoiceGender) {
  const value = name.toLowerCase();
  if (gender === "femenina") {
    return /female|mujer|sabina|dalia|ximena|salome|paulina|helena|monica|sofia|larissa/.test(
      value,
    );
  }
  return /male|hombre|jorge|diego|raul|raul|pablo|gerardo|juan|tristan|victor|mario|carlos/.test(
    value,
  );
}

function closestSystemVoice(gender: VoiceGender) {
  if (typeof window === "undefined" || !window.speechSynthesis) return null;
  const voices = window.speechSynthesis.getVoices();
  const spanish = voices.filter((voice) => voice.lang.toLowerCase().startsWith("es"));
  const pool = (spanish.length ? spanish : voices).slice();
  const mexican = pool.filter((voice) => voice.lang.toLowerCase().startsWith("es-mx"));
  const ordered = [
    ...mexican,
    ...pool.filter((voice) => !voice.lang.toLowerCase().startsWith("es-mx")),
  ];
  return (ordered.find((voice) => matchesGender(voice.name, gender)) ?? ordered[0])?.name ?? null;
}

function textChunks(text: string) {
  const clean = text.replace(/\s+/g, " ").trim();
  if (!clean) return [];
  const chunks: string[] = [];
  let rest = clean;
  while (rest.length > 1000) {
    let cut = rest.lastIndexOf(" ", 1000);
    if (cut < 400) cut = 1000;
    chunks.push(rest.slice(0, cut).trim());
    rest = rest.slice(cut).trim();
  }
  if (rest) chunks.push(rest);
  return chunks;
}

function base64ToUrl(audioBase64: string) {
  const binary = atob(audioBase64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return URL.createObjectURL(new Blob([bytes], { type: "audio/mpeg" }));
}

async function audioUrlFor(voice: AzureVoice, text: string, rate: number, pitch: number) {
  const key = `${voice.id}|${rate}|${pitch}|${text}`;
  const cached = sessionAudio.get(key);
  if (cached) return cached;
  const result = await synthesizeAzureSpeech({
    data: { texto: text, voiceId: voice.id, velocidad: rate, tono: pitch },
  });
  if (!result?.audioBase64) throw new Error("unavailable");
  const url = base64ToUrl(result.audioBase64);
  sessionAudio.set(key, url);
  return url;
}

function playUrl(url: string, token: number) {
  return new Promise<void>((resolve, reject) => {
    if (token !== playbackToken) {
      reject(cancelled());
      return;
    }
    const audio = new Audio(url);
    playback = audio;
    playbackReject = reject;
    const finish = (error?: Error) => {
      if (playback === audio) playback = null;
      if (playbackReject === reject) playbackReject = null;
      audio.onended = null;
      audio.onerror = null;
      if (error) reject(error);
      else resolve();
    };
    audio.onended = () => finish();
    audio.onerror = () => finish(new Error("unavailable"));
    void audio.play().catch(() => finish(new Error("unavailable")));
  });
}

function takePlayback() {
  const reject = playbackReject;
  playbackReject = null;
  const audio = playback;
  playback = null;
  if (audio) {
    audio.onended = null;
    audio.onerror = null;
    audio.pause();
  }
  playbackToken += 1;
  reject?.(cancelled());
  return playbackToken;
}

export function stopNaturalSpeech() {
  takePlayback();
}

async function playAzure(voice: AzureVoice, text: string, rate: number, pitch: number) {
  const token = takePlayback();
  const chunks = textChunks(text);
  if (!chunks.length) return;
  for (const chunk of chunks) {
    if (token !== playbackToken) throw cancelled();
    const url = await audioUrlFor(voice, chunk, rate, pitch);
    if (token !== playbackToken) throw cancelled();
    await playUrl(url, token);
  }
}

export function speakNaturalOrFallback(options: {
  text: string;
  storedVoice?: string | null;
  rate: number;
  pitch: number;
}) {
  const azure = findAzureVoice(options.storedVoice);
  if (!azure || typeof window === "undefined") {
    return speakWithBrowser(options.text, options.storedVoice, options.rate, options.pitch);
  }
  window.speechSynthesis?.cancel();
  return playAzure(azure, options.text, options.rate, options.pitch).catch((error: unknown) => {
    if (isSpeechCancelled(error)) throw error;
    warnFallback();
    return speakWithBrowser(
      options.text,
      closestSystemVoice(azure.gender) ?? options.storedVoice,
      options.rate,
      options.pitch,
    );
  });
}

let catalogRequest: Promise<AzureVoice[]> | null = null;

export function loadAvailableAzureVoices() {
  if (typeof window === "undefined") return Promise.resolve([]);
  catalogRequest ??= listAzureCatalogVoices().catch(() => [] as AzureVoice[]);
  return catalogRequest;
}

export function startVoicePreview(storedVoice: string) {
  const generation = ++previewGeneration;
  stopNaturalSpeech();
  window.speechSynthesis?.cancel();
  setPreview(storedVoice);
  void speakNaturalOrFallback({
    text: VOICE_PREVIEW_TEXT,
    storedVoice,
    rate: DEFAULT_SPEECH_RATE,
    pitch: DEFAULT_SPEECH_PITCH,
  }).finally(() => {
    if (generation === previewGeneration) setPreview(null);
  });
}

export function stopVoicePreview() {
  previewGeneration += 1;
  stopNaturalSpeech();
  window.speechSynthesis?.cancel();
  setPreview(null);
}

if (typeof window !== "undefined") {
  window.addEventListener("pagehide", () => stopVoicePreview());
}
