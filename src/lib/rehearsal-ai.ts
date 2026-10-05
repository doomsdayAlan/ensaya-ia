/**
 * IA de ensayo en el navegador: Web Speech API (STT) + speechSynthesis (TTS).
 * En la nube hace falta HTTPS (salvo localhost). Chrome/Edge; Safari es limitado.
 */
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

export {
  buildFeedback,
  effectiveMatchDifficulty,
  evaluateSpokenLine,
  lineSimilarity,
  matchThreshold,
  normalizeSpeech,
  scoreRehearsal,
} from "@/lib/rehearsal-match";

export function pickVoice(preferred?: string | null) {
  if (typeof window === "undefined") return null;
  const voices = window.speechSynthesis.getVoices();
  if (!voices.length) return null;

  const spanish = voices.filter((voice) => voice.lang.toLowerCase().startsWith("es"));
  const pool = spanish.length ? spanish : voices;
  const hint = (preferred ?? "").toLowerCase();
  const wantFemale = hint.includes("sofia") || hint.includes("valeria") || hint.includes("femen");
  const wantMale = hint.includes("diego") || hint.includes("mascul");

  const gendered = pool.filter((voice) => {
    const name = voice.name.toLowerCase();
    if (wantFemale) return /female|mujer|monica|sabina|paulina|helena|sofi/.test(name);
    if (wantMale) return /male|hombre|jorge|diego|pablo|carlos/.test(name);
    return true;
  });

  return gendered[0] ?? pool[0] ?? null;
}

export function speakLine(text: string, preferredVoice?: string | null) {
  if (!canUseSpeechSynthesis()) {
    return Promise.reject(new Error("Este navegador no puede hablar las lineas de IA."));
  }

  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = SPEECH_LOCALE;
  utterance.rate = 0.96;
  utterance.pitch = 1;
  const voice = pickVoice(preferredVoice);
  if (voice) {
    utterance.voice = voice;
    utterance.lang = voice.lang;
  }

  return new Promise<void>((resolve, reject) => {
    // Algunos WebViews no disparan onend; el timer evita que el ensayo se congele.
    const fallbackMs = Math.min(14_000, 2_200 + text.length * 55);
    const timer = window.setTimeout(() => resolve(), fallbackMs);
    utterance.onend = () => {
      window.clearTimeout(timer);
      resolve();
    };
    utterance.onerror = (event) => {
      window.clearTimeout(timer);
      if (event.error === "interrupted" || event.error === "canceled") {
        resolve();
        return;
      }
      reject(new Error("No se pudo reproducir la linea de IA."));
    };
    window.speechSynthesis.speak(utterance);
  });
}

export function stopSpeaking() {
  if (typeof window === "undefined") return;
  window.speechSynthesis.cancel();
}

function collectTranscripts(result: BrowserSpeechRecognitionEvent["results"][number]) {
  const count = result.length ?? 1;
  return Array.from({ length: count }, (_, index) => result[index]?.transcript ?? "").filter(Boolean);
}

export function listenForLine(options: {
  onTranscript: (text: string, isFinal: boolean) => void;
  onError?: (message: string) => void;
}): { stop: () => void } | null {
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
    for (let i = event.resultIndex; i < event.results.length; i += 1) {
      const result = event.results[i];
      if (!result) continue;
      const transcripts = collectTranscripts(result).join(" ");
      if (result.isFinal) collected = `${collected} ${transcripts}`.trim();
      else interim = transcripts.trim();
    }
    options.onTranscript(`${collected} ${interim}`.trim(), Boolean(collected));
  };

  recognition.onerror = (event) => {
    if (event.error === "aborted" || event.error === "no-speech") return;
    options.onError?.(
      event.error === "not-allowed"
        ? "Permite el microfono para que la IA te escuche."
        : "No se pudo escuchar el microfono.",
    );
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
    options.onError?.(error instanceof Error ? error.message : "No se pudo iniciar el reconocimiento de voz.");
    return null;
  }

  return {
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
