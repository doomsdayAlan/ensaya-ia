import { useEffect, useState } from "react";
import { Mic, Square, Volume2 } from "lucide-react";
import { canUseSpeechSynthesis, speakLine, stopSpeaking } from "@/lib/rehearsal-ai";

/** Modos listos para escalar: hoy feedback; welcome = saludo en inicio/login. */
export type DirectorAvatarMode = "feedback" | "welcome";

type DirectorAvatarProps = {
  mode?: DirectorAvatarMode;
  text: string;
  /** Etiqueta de origen (ej. Notas del director · Gemini). */
  sourceLabel?: string;
  /** Si true, lee el texto al montar (util en welcome futuro). */
  autoSpeak?: boolean;
  className?: string;
};

/**
 * Director virtual de Ensaya IA.
 * Fase actual: presenta la retroalimentacion al finalizar.
 * Disenado para reutilizarse luego en inicio y otras pantallas (mode="welcome").
 */
export function DirectorAvatar({
  mode = "feedback",
  text,
  sourceLabel,
  autoSpeak = false,
  className = "",
}: DirectorAvatarProps) {
  const [speaking, setSpeaking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const speechOk = canUseSpeechSynthesis();
  const title = mode === "welcome" ? "Director de Ensaya IA" : "Notas del director";
  const buttonLabel = speaking ? "Detener" : mode === "welcome" ? "Escuchar saludo" : "Escuchar retroalimentacion";

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

  return (
    <div
      className={`rounded-xl border border-primary/25 bg-primary/10 p-4 ${className}`}
      data-director-mode={mode}
    >
      <div className="flex flex-col sm:flex-row gap-4 items-start">
        <div className="shrink-0 mx-auto sm:mx-0 text-center">
          <DirectorFigure speaking={speaking} />
          <p className="mt-2 text-[10px] tracking-[0.2em] uppercase text-muted-foreground">Director</p>
        </div>

        <div className="min-w-0 flex-1 space-y-3">
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
              className="inline-flex items-center gap-2 rounded-lg border border-primary/40 bg-surface px-3 py-1.5 text-xs font-medium hover:border-primary/70 transition disabled:opacity-50"
            >
              {speaking ? <Square className="w-3.5 h-3.5 fill-current" /> : <Volume2 className="w-3.5 h-3.5" />}
              {buttonLabel}
            </button>
          </div>

          <div className="relative rounded-lg bg-surface/80 border border-border/50 p-3 text-sm leading-relaxed">
            <span
              className="absolute -left-1.5 top-4 hidden sm:block w-3 h-3 rotate-45 bg-surface/80 border-l border-b border-border/50"
              aria-hidden
            />
            <p className="text-foreground/95 whitespace-pre-wrap">{text || "Sin notas para este ensayo."}</p>
          </div>

          {error && <p className="text-xs text-destructive">{error}</p>}

          <p className="text-[10px] text-muted-foreground leading-relaxed flex items-start gap-1.5">
            <Mic className="w-3 h-3 shrink-0 mt-0.5 opacity-70" />
            Prototipo de director virtual en la retroalimentacion. La misma pieza esta preparada para
            acompanarte luego en inicio y otras pantallas.
          </p>
        </div>
      </div>
    </div>
  );
}

function DirectorFigure({ speaking }: { speaking: boolean }) {
  return (
    <div
      className={`relative w-24 h-24 rounded-full bg-stage border border-primary/30 shadow-glow overflow-hidden ${
        speaking ? "director-speaking" : "director-idle"
      }`}
      aria-hidden
    >
      <svg viewBox="0 0 96 96" className="w-full h-full">
        <defs>
          <radialGradient id="directorGlow" cx="50%" cy="30%" r="60%">
            <stop offset="0%" stopColor="oklch(0.85 0.18 70 / 0.45)" />
            <stop offset="100%" stopColor="oklch(0.16 0.01 50 / 0)" />
          </radialGradient>
        </defs>
        <rect width="96" height="96" fill="url(#directorGlow)" />
        {/* torso / coat */}
        <path d="M28 92 C28 68 68 68 68 92 Z" fill="oklch(0.28 0.02 55)" />
        <path d="M44 70 L48 92 L52 70 Z" fill="oklch(0.78 0.16 60 / 0.85)" />
        {/* head */}
        <circle cx="48" cy="42" r="18" fill="oklch(0.82 0.04 70)" />
        {/* hair */}
        <path
          d="M30 42 C30 26 66 26 66 42 C62 30 34 30 30 42 Z"
          fill="oklch(0.22 0.02 50)"
        />
        {/* eyes */}
        <circle cx="42" cy="42" r="1.8" fill="oklch(0.2 0.02 50)" />
        <circle cx="54" cy="42" r="1.8" fill="oklch(0.2 0.02 50)" />
        {/* mouth: closed vs open when speaking */}
        {speaking ? (
          <ellipse cx="48" cy="52" rx="4.5" ry="3.2" fill="oklch(0.35 0.05 25)" />
        ) : (
          <path d="M43 51 Q48 55 53 51" stroke="oklch(0.35 0.04 40)" strokeWidth="1.6" fill="none" strokeLinecap="round" />
        )}
        {/* headset mic */}
        <path d="M66 42 Q74 42 74 50" stroke="oklch(0.78 0.16 60)" strokeWidth="2" fill="none" />
        <circle cx="74" cy="52" r="2.5" fill="oklch(0.78 0.16 60)" />
      </svg>
      {speaking && (
        <div className="absolute bottom-1 inset-x-0 flex justify-center gap-0.5">
          <span className="director-bar" />
          <span className="director-bar delay-75" />
          <span className="director-bar delay-150" />
        </div>
      )}
    </div>
  );
}
