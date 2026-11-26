/**
 * IA de ensayo en el navegador: Web Speech API (STT) + speechSynthesis (TTS).
 * En la nube hace falta HTTPS (salvo localhost). Chrome/Edge; Safari es limitado.
 */
import { speakNaturalOrFallback, stopNaturalSpeech } from "@/lib/voice-service";

export { isSpeechCancelled } from "@/lib/voice-service";
type SpeechRecognitionCtor = new () => BrowserSpeechRecognition;

type BrowserSpeechRecognition = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  onresult: ((event: BrowserSpeechRecognitionEvent) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
};

type BrowserSpeechRecognitionEvent = {
  resultIndex: number;
  results: ArrayLike<{
    isFinal: boolean;
    length?: number;
    [index: number]: { transcript: string } | undefined;
  }>;
};

const SPEECH_LOCALE = "es-MX";

function getSpeechRecognitionCtor(): SpeechRecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as Window & {
    SpeechRecognition?: SpeechRecognitionCtor;
    webkitSpeechRecognition?: SpeechRecognitionCtor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export function canUseSpeechRecognition() {
  return Boolean(getSpeechRecognitionCtor());
}

export function canUseSpeechSynthesis() {
  return typeof window !== "undefined" && "speechSynthesis" in window;
}

/** El reconocimiento y la síntesis de voz piden Chrome/Edge en HTTPS. */
export function speechBrowserHint() {
  return "Usa Chrome o Edge en una conexión segura (HTTPS).";
}

export {
  buildFeedback,
  effectiveMatchDifficulty,
  evaluateSpokenLine,
  lineSimilarity,
  matchThreshold,
  normalizeSpeech,
  scoreRehearsal,
} from "@/lib/rehearsal-match";

const FEMALE_NAMES = new Set([
  "MARTA",
  "MARIA",
  "ANA",
  "JULIETA",
  "MADRE",
  "ABUELA",
  "SOFIA",
  "LUCIA",
  "CARMEN",
  "LAURA",
  "ELENA",
  "ROSA",
  "INES",
  "PAULA",
  "CLARA",
  "BEATRIZ",
  "CAPERUCITA",
]);
const MALE_NAMES = new Set([
  "JUAN",
  "PEDRO",
  "GENARO",
  "MATEO",
  "DIEGO",
  "ROMEO",
  "PADRE",
  "ABUELO",
  "CARLOS",
  "LUIS",
  "JOSE",
  "ALEJANDRO",
  "LUPERCIO",
]);

/** Voz del navegador según el nombre. No usa un servicio de pago. */
export function inferVoiceLabel(name: string) {
  const first = name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .split(/\s+/)[0];
  if (!first) return "Valeria (Neutra)";
  if (FEMALE_NAMES.has(first)) return "Sofia (Femenina)";
  if (MALE_NAMES.has(first)) return "Diego (Masculino)";
  if (first.endsWith("A")) return "Sofia (Femenina)";
  if (first.endsWith("O")) return "Diego (Masculino)";
  return "Valeria (Neutra)";
}

function voiceRank(voice: SpeechSynthesisVoice) {
  const name = voice.name.toLowerCase();
  const lang = voice.lang.toLowerCase();
  let rank = 0;
  if (/google/.test(name) && lang.startsWith("es")) rank += 50;
  if (/microsoft/.test(name) && /natural|online/.test(name)) rank += 40;
  if (/paulina|sabina|dalia|jorge/.test(name)) rank += 30;
  if (/natural|online|premium/.test(name)) rank += 15;
  if (lang.startsWith("es-mx")) rank += 8;
  else if (lang.startsWith("es")) rank += 4;
  return rank;
}

export function pickVoice(preferred?: string | null) {
  if (typeof window === "undefined") return null;
  const voices = window.speechSynthesis.getVoices();
  if (!voices.length) return null;

  const spanish = voices.filter((voice) => voice.lang.toLowerCase().startsWith("es"));
  const pool = (spanish.length ? spanish : voices)
    .slice()
    .sort((a, b) => voiceRank(b) - voiceRank(a));
  const hint = (preferred ?? "").toLowerCase().trim();
  const exact = voices.find((voice) => voice.name.toLowerCase() === hint);
  if (exact) return exact;
  const wantFemale = hint.includes("sofia") || hint.includes("valeria") || hint.includes("femen");
  const wantMale = hint.includes("diego") || hint.includes("mascul");

  const gendered = pool.filter((voice) => {
    const name = voice.name.toLowerCase();
    if (wantFemale) return /female|mujer|monica|sabina|paulina|helena|sofi|dalia/.test(name);
    if (wantMale) return /male|hombre|jorge|diego|pablo|carlos/.test(name);
    return true;
  });

  return gendered[0] ?? pool[0] ?? null;
}

/** Nombres reales de speechSynthesis, con prioridad a español natural. */
export function listBrowserVoiceNames() {
  if (typeof window === "undefined" || !window.speechSynthesis) return [];
  const voices = window.speechSynthesis.getVoices();
  const spanish = voices
    .filter((voice) => voice.lang.toLowerCase().startsWith("es"))
    .slice()
    .sort((a, b) => voiceRank(b) - voiceRank(a) || a.name.localeCompare(b.name, "es"));
  const source = spanish.length
    ? spanish
    : voices.slice().sort((a, b) => voiceRank(b) - voiceRank(a));
  return Array.from(new Set(source.map((voice) => voice.name)));
}

/** rate/pitch segun emocion base del personaje (modo "sugerir emociones"). */
export function emotionProsody(emotion?: string | null): { rate: number; pitch: number } {
  const e = (emotion ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  if (/aleg|felic|goz|eufor|excit/.test(e)) return { rate: 1.08, pitch: 1.18 };
  if (/trist|melanc|dolor|llor|pena/.test(e)) return { rate: 0.86, pitch: 0.82 };
  if (/enoj|ira|rabia|fur|molest/.test(e)) return { rate: 1.12, pitch: 0.88 };
  if (/mied|temor|ansie|nerv|preocup/.test(e)) return { rate: 1.06, pitch: 1.22 };
  if (/romant|amor|ternur|carin|cariñ|pasion|pasión|enamor/.test(e))
    return { rate: 0.9, pitch: 1.12 };
  if (/calma|seren|neut|tranquil/.test(e)) return { rate: 0.94, pitch: 1 };
  return { rate: 0.96, pitch: 1 };
}

/**
 * Voz del perfil: solo por defecto para director/lector, o para todos si useProfileVoiceForAll.
 * Los personajes conservan character.voice salvo ese override.
 */
export function resolveRehearsalVoice(options: {
  preferredVoice?: string | null;
  characterVoice?: string | null;
  useProfileVoiceForAll?: boolean;
  /** true = voz del director / lector virtual (usa perfil). */
  forDirector?: boolean;
}) {
  if (options.forDirector) return options.preferredVoice ?? null;
  if (options.useProfileVoiceForAll && options.preferredVoice) return options.preferredVoice;
  return options.characterVoice ?? null;
}

export const DEFAULT_SPEECH_RATE = 0.92;
export const DEFAULT_SPEECH_PITCH = 1.02;

export function speakWithBrowser(
  text: string,
  preferredVoice?: string | null,
  rate = DEFAULT_SPEECH_RATE,
  pitch = DEFAULT_SPEECH_PITCH,
) {
  if (!canUseSpeechSynthesis()) {
    return Promise.reject(new Error("Este navegador no puede leer las líneas en voz alta."));
  }

  const synth = window.speechSynthesis;
  synth.cancel();

  return new Promise<void>((resolve, reject) => {
    let settled = false;
    let started = false;
    let retries = 0;
    const fallbackMs = Math.min(20_000, 2_800 + text.length * 70);
    let timer = 0;

    const settle = (ok: boolean, error?: Error) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      if (ok) resolve();
      else reject(error ?? new Error("No se pudo reproducir la línea con la voz del navegador."));
    };

    const armTimeout = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => settle(true), fallbackMs);
    };

    const speak = () => {
      if (settled) return;
      if (synth.paused) {
        try {
          synth.resume();
        } catch {
          // Chrome a veces deja la cola en pausa tras cancel().
        }
      }
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = SPEECH_LOCALE;
      utterance.rate = rate;
      utterance.pitch = pitch;
      const voice = pickVoice(preferredVoice);
      if (voice) {
        utterance.voice = voice;
        utterance.lang = voice.lang;
      }
      utterance.onstart = () => {
        started = true;
        armTimeout();
      };
      utterance.onend = () => settle(true);
      utterance.onerror = (event) => {
        const code = event.error;
        if ((code === "interrupted" || code === "canceled") && !started && retries < 2) {
          retries += 1;
          window.setTimeout(speak, 80);
          return;
        }
        if (code === "interrupted" || code === "canceled") {
          // Si nunca empezó, no cuenta como leída. Si ya sonaba, el usuario cambió de línea.
          if (started) settle(true);
          else settle(false, new Error("La voz se interrumpió antes de empezar."));
          return;
        }
        settle(false, new Error("No se pudo reproducir la línea con la voz del navegador."));
      };
      armTimeout();
      synth.speak(utterance);
      if (synth.paused) {
        try {
          synth.resume();
        } catch {
          // ignore
        }
      }
    };

    // Chrome no reproduce si speak() va en el mismo tick que cancel().
    window.setTimeout(speak, 40);
  });
}

export function speakLine(
  text: string,
  preferredVoice?: string | null,
  options?: { emotion?: string | null; applyEmotion?: boolean },
) {
  const prosody =
    options?.applyEmotion && options.emotion
      ? emotionProsody(options.emotion)
      : { rate: DEFAULT_SPEECH_RATE, pitch: DEFAULT_SPEECH_PITCH };
  return speakNaturalOrFallback({
    text,
    storedVoice: preferredVoice,
    rate: prosody.rate,
    pitch: prosody.pitch,
  });
}

export function stopSpeaking() {
  if (typeof window === "undefined") return;
  window.speechSynthesis.cancel();
  stopNaturalSpeech();
}

function collectTranscripts(result: BrowserSpeechRecognitionEvent["results"][number]) {
  const count = result.length ?? 1;
  return Array.from({ length: count }, (_, index) => result[index]?.transcript ?? "").filter(
    Boolean,
  );
}

export function listenForLine(options: {
  onTranscript: (text: string, isFinal: boolean) => void;
  onError?: (message: string) => void;
}): { stop: () => void; reset: () => void } | null {
  const Ctor = getSpeechRecognitionCtor();
  if (!Ctor) return null;

  const recognition = new Ctor();
  recognition.lang = SPEECH_LOCALE;
  recognition.continuous = true;
  recognition.interimResults = true;
  recognition.maxAlternatives = 3;

  let stopped = false;
  let collected = "";

  recognition.onresult = (event) => {
    let interim = "";
    let sawFinal = false;
    for (let i = event.resultIndex; i < event.results.length; i += 1) {
      const result = event.results[i];
      if (!result) continue;
      const transcripts = collectTranscripts(result).join(" ");
      if (result.isFinal) {
        collected = `${collected} ${transcripts}`.trim();
        sawFinal = true;
      } else {
        interim = transcripts.trim();
      }
    }
    if (sawFinal) {
      options.onTranscript(collected, true);
    } else {
      options.onTranscript(`${collected} ${interim}`.trim(), false);
    }
  };

  recognition.onerror = (event) => {
    if (event.error === "aborted" || event.error === "no-speech") return;
    if (event.error === "not-allowed") {
      stopped = true;
      try {
        recognition.stop();
      } catch {
        recognition.abort();
      }
      options.onError?.("Permite el micrófono para que la app te escuche.");
      return;
    }
    options.onError?.("No se pudo escuchar el micrófono.");
  };

  recognition.onend = () => {
    if (stopped) return;
    try {
      recognition.start();
    } catch {
      // Chrome dispara onend mientras start() todavia corre.
    }
  };

  try {
    recognition.start();
  } catch (error) {
    options.onError?.(
      error instanceof Error ? error.message : "No se pudo iniciar el reconocimiento de voz.",
    );
    return null;
  }

  return {
    reset: () => {
      collected = "";
    },
    stop: () => {
      stopped = true;
      try {
        recognition.onend = null;
        recognition.stop();
      } catch {
        recognition.abort();
      }
    },
  };
}
