import { useEffect, useId, useState } from "react";
import { Mic, Square, Volume2 } from "lucide-react";
import { canUseSpeechSynthesis, speakLine, stopSpeaking } from "@/lib/rehearsal-ai";

/** Modos listos para escalar: hoy feedback; welcome = saludo en inicio/login. */
export type DirectorAvatarMode = "feedback" | "welcome";

/** Estado emocional del blob (reacciona a la sesion). */
export type DirectorMood = "idle" | "speaking" | "celebrate" | "coach" | "listen";

type DirectorAvatarProps = {
  mode?: DirectorAvatarMode;
  text: string;
  /** Fuerza un mood; si no, speaking manda y moodOverride/score definen el resto. */
  mood?: DirectorMood;
  /** 0–100: celebra si alto, anima si bajo. */
  score?: number;
  /** Etiqueta de origen (ej. Notas del director · Gemini). */
  sourceLabel?: string;
  /** Si true, lee el texto al montar (util en welcome futuro). */
  autoSpeak?: boolean;
  className?: string;
};

function moodFromScore(score: number | undefined): DirectorMood {
  if (score == null || Number.isNaN(score)) return "idle";
  if (score >= 85) return "celebrate";
  if (score < 65) return "coach";
  return "idle";
}

/**
 * Director virtual de Ensaya IA — mascota blob amigable.
 * Fase actual: presenta la retroalimentacion al finalizar.
 * Disenado para reutilizarse luego en inicio y otras pantallas (mode="welcome").
 */
export function DirectorAvatar({
  mode = "feedback",
  text,
  mood: moodProp,
  score,
  sourceLabel,
  autoSpeak = false,
  className = "",
}: DirectorAvatarProps) {
  const [speaking, setSpeaking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const speechOk = canUseSpeechSynthesis();
  const title = mode === "welcome" ? "Tu companero de ensayo" : "Notas del director";
  const buttonLabel = speaking
    ? "Detener"
    : mode === "welcome"
      ? "Escuchar saludo"
      : "Escuchar notas";

  const baseMood = moodProp ?? moodFromScore(score);
  const mood: DirectorMood = speaking ? "speaking" : baseMood;

  useEffect(() => {
    return () => stopSpeaking();
  }, []);

  useEffect(() => {
    if (!autoSpeak || !text.trim() || !speechOk) return;
    let cancelled = false;
    setSpeaking(true);
    void speakLine(text, "Sofia (Femenina)")
      .catch(() => {
        if (!cancelled) setError("No se pudo reproducir la voz en este navegador.");
      })
      .finally(() => {
        if (!cancelled) setSpeaking(false);
      });
    return () => {
      cancelled = true;
      stopSpeaking();
    };
  }, [autoSpeak, text, speechOk]);

  const toggleSpeak = () => {
    setError(null);
    if (speaking) {
      stopSpeaking();
      setSpeaking(false);
      return;
    }
    if (!speechOk) {
      setError("Usa Chrome o Edge para escuchar al director.");
      return;
    }
    if (!text.trim()) return;
    setSpeaking(true);
    void speakLine(text, "Sofia (Femenina)")
      .catch(() => setError("No se pudo reproducir la voz en este navegador."))
      .finally(() => setSpeaking(false));
  };

  const moodHint =
    mood === "celebrate"
      ? "¡Que buen ensayo!"
      : mood === "coach"
        ? "Vamos otra vez, tu puedes"
        : mood === "speaking"
          ? "Te estoy contando…"
          : "Listo para ayudarte";

  return (
    <div
      className={`rounded-2xl border border-primary/20 bg-gradient-to-br from-primary/15 via-surface/40 to-stage/80 p-4 sm:p-5 overflow-hidden ${className}`}
      data-director-mode={mode}
      data-director-mood={mood}
    >
      <div className="flex flex-col sm:flex-row gap-5 items-center sm:items-start">
        <div className="shrink-0 text-center">
          <DirectorBlob mood={mood} />
          <p className="mt-2 text-[10px] tracking-[0.22em] uppercase text-muted-foreground">Ensayín</p>
          <p className="text-xs text-primary/90 mt-0.5">{moodHint}</p>
        </div>

        <div className="min-w-0 flex-1 space-y-3 w-full">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div>
              <h3 className="font-medium text-sm">{title}</h3>
              {sourceLabel && (
                <p className="text-[10px] tracking-widest uppercase text-muted-foreground mt-0.5">
                  {sourceLabel}
                </p>
              )}
            </div>
            <button
              type="button"
              onClick={toggleSpeak}
              disabled={!text.trim()}
              className="inline-flex items-center gap-2 rounded-full border border-primary/40 bg-surface/90 px-3.5 py-1.5 text-xs font-medium hover:border-primary/70 hover:bg-primary/10 transition disabled:opacity-50"
            >
              {speaking ? <Square className="w-3.5 h-3.5 fill-current" /> : <Volume2 className="w-3.5 h-3.5" />}
              {buttonLabel}
            </button>
          </div>

          <div className="relative rounded-2xl bg-surface/90 border border-border/40 p-3.5 text-sm leading-relaxed shadow-sm">
            <span
              className="absolute -left-2 top-8 hidden sm:block w-3.5 h-3.5 rotate-45 bg-surface/90 border-l border-b border-border/40"
              aria-hidden
            />
            <p className="text-foreground/95 whitespace-pre-wrap">{text || "Sin notas para este ensayo."}</p>
          </div>

          {error && <p className="text-xs text-destructive">{error}</p>}

          <p className="text-[10px] text-muted-foreground leading-relaxed flex items-start gap-1.5">
            <Mic className="w-3 h-3 shrink-0 mt-0.5 opacity-70" />
            Tocá “Escuchar notas” para oír al director. Pronto Ensayín también te acompañará al empezar.
          </p>
        </div>
      </div>
    </div>
  );
}

function DirectorBlob({ mood }: { mood: DirectorMood }) {
  const uid = useId().replace(/:/g, "");
  const bodyGrad = `blob-body-${uid}`;
  const glowGrad = `blob-glow-${uid}`;
  const shineGrad = `blob-shine-${uid}`;

  const eyeOpen = mood === "celebrate" ? 7.5 : mood === "coach" ? 5.5 : 6.2;
  const eyeGap = mood === "celebrate" ? 11 : 10;
  const mouth =
    mood === "celebrate" ? "smile-big" : mood === "coach" ? "soft" : mood === "speaking" ? "talk" : "smile";

  return (
    <div
      className={`director-blob relative w-36 h-36 mx-auto ${
        mood === "speaking" ? "director-blob--speaking" : "director-blob--idle"
      }`}
      aria-hidden
    >
      <div className="director-blob__rings absolute inset-0 pointer-events-none" aria-hidden>
        <span className="director-blob__ring" />
        <span className="director-blob__ring director-blob__ring--2" />
        <span className="director-blob__ring director-blob__ring--3" />
      </div>

      <svg viewBox="0 0 160 160" className="relative z-[1] w-full h-full drop-shadow-lg">
        <defs>
          <radialGradient id={glowGrad} cx="50%" cy="42%" r="55%">
            <stop offset="0%" stopColor="oklch(0.85 0.18 70 / 0.55)" />
            <stop offset="70%" stopColor="oklch(0.78 0.16 60 / 0.12)" />
            <stop offset="100%" stopColor="oklch(0.16 0.01 50 / 0)" />
          </radialGradient>
          <linearGradient id={bodyGrad} x1="30%" y1="10%" x2="80%" y2="95%">
            <stop offset="0%" stopColor="oklch(0.88 0.12 75)" />
            <stop offset="45%" stopColor="oklch(0.78 0.16 60)" />
            <stop offset="100%" stopColor="oklch(0.62 0.14 55)" />
          </linearGradient>
          <radialGradient id={shineGrad} cx="35%" cy="28%" r="45%">
            <stop offset="0%" stopColor="oklch(1 0.02 90 / 0.55)" />
            <stop offset="100%" stopColor="oklch(1 0 0 / 0)" />
          </radialGradient>
        </defs>

        <circle cx="80" cy="80" r="72" fill={`url(#${glowGrad})`} />

        <g className="director-blob__body">
          {/* Organic blob — soft cloud / amoeba silhouette */}
          <path
            d="M80 28
               C104 28 126 44 128 68
               C130 90 116 112 96 122
               C86 127 74 128 64 124
               C42 116 30 96 32 74
               C34 48 54 28 80 28 Z"
            fill={`url(#${bodyGrad})`}
          />
          {/* Soft wobble earlobe bumps */}
          <ellipse cx="38" cy="78" rx="14" ry="18" fill={`url(#${bodyGrad})`} opacity="0.95" />
          <ellipse cx="122" cy="78" rx="14" ry="18" fill={`url(#${bodyGrad})`} opacity="0.95" />
          <ellipse cx="80" cy="42" rx="36" ry="28" fill={`url(#${shineGrad})`} />

          {/* Eyes group — blink + look */}
          <g className="director-blob__eyes" style={{ transformOrigin: "80px 72px" }}>
            <g className="director-blob__eye" transform={`translate(${80 - eyeGap}, 72)`}>
              <ellipse
                className="director-blob__eye-white"
                cx="0"
                cy="0"
                rx="9"
                ry={eyeOpen}
                fill="oklch(0.98 0.01 90)"
              />
              <circle className="director-blob__pupil" cx="1.2" cy="1" r="3.4" fill="oklch(0.22 0.03 50)" />
              <circle cx="-1.5" cy="-1.8" r="1.1" fill="oklch(1 0 0 / 0.85)" />
            </g>
            <g className="director-blob__eye" transform={`translate(${80 + eyeGap}, 72)`}>
              <ellipse
                className="director-blob__eye-white"
                cx="0"
                cy="0"
                rx="9"
                ry={eyeOpen}
                fill="oklch(0.98 0.01 90)"
              />
              <circle className="director-blob__pupil" cx="1.2" cy="1" r="3.4" fill="oklch(0.22 0.03 50)" />
              <circle cx="-1.5" cy="-1.8" r="1.1" fill="oklch(1 0 0 / 0.85)" />
            </g>
            {mood === "celebrate" && (
              <>
                <path
                  d="M58 58 Q69 52 78 58"
                  stroke="oklch(0.45 0.08 40)"
                  strokeWidth="2"
                  fill="none"
                  strokeLinecap="round"
                />
                <path
                  d="M82 58 Q91 52 102 58"
                  stroke="oklch(0.45 0.08 40)"
                  strokeWidth="2"
                  fill="none"
                  strokeLinecap="round"
                />
              </>
            )}
          </g>

          {/* Mouth */}
          {mouth === "talk" ? (
            <ellipse className="director-blob__mouth-talk" cx="80" cy="96" rx="7" ry="5.5" fill="oklch(0.32 0.06 30)" />
          ) : mouth === "smile-big" ? (
            <path
              d="M66 92 Q80 112 94 92"
              stroke="oklch(0.32 0.05 40)"
              strokeWidth="3"
              fill="none"
              strokeLinecap="round"
            />
          ) : mouth === "soft" ? (
            <path
              d="M70 98 Q80 104 90 98"
              stroke="oklch(0.35 0.04 40)"
              strokeWidth="2.4"
              fill="none"
              strokeLinecap="round"
            />
          ) : (
            <path
              d="M68 94 Q80 106 92 94"
              stroke="oklch(0.32 0.05 40)"
              strokeWidth="2.6"
              fill="none"
              strokeLinecap="round"
            />
          )}

          {/* Cheek blush when celebrate / idle */}
          {(mood === "celebrate" || mood === "idle") && (
            <>
              <ellipse cx="54" cy="88" rx="7" ry="4" fill="oklch(0.72 0.12 25 / 0.35)" />
              <ellipse cx="106" cy="88" rx="7" ry="4" fill="oklch(0.72 0.12 25 / 0.35)" />
            </>
          )}
        </g>
      </svg>

      {mood === "speaking" && (
        <div className="absolute bottom-2 inset-x-0 flex justify-center gap-1 z-[2]">
          <span className="director-bar" />
          <span className="director-bar delay-75" />
          <span className="director-bar delay-150" />
        </div>
      )}
    </div>
  );
}
