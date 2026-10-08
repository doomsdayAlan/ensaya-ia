import { useEffect, useId, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Mic, Square, Volume2 } from "lucide-react";
import { canUseSpeechSynthesis, resolveRehearsalVoice, speakLine, stopSpeaking } from "@/lib/rehearsal-ai";
import { getPerfilUsuario } from "@/lib/rehearsal-data";

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
  const { data: profileData } = useQuery({
    queryKey: ["perfil-usuario"],
    queryFn: getPerfilUsuario,
  });
  const directorVoice =
    resolveRehearsalVoice({
      preferredVoice: profileData?.profile?.preferred_voice ?? null,
      forDirector: true,
    }) ?? "Sofia (Femenina)";
  const title = mode === "welcome" ? "Tu compañero de ensayo" : "Notas del director";
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
    void speakLine(text, directorVoice)
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
  }, [autoSpeak, text, speechOk, directorVoice]);

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
    void speakLine(text, directorVoice)
      .catch(() => setError("No se pudo reproducir la voz en este navegador."))
      .finally(() => setSpeaking(false));
  };

  const moodHint =
    mood === "celebrate"
      ? "¡Qué buen ensayo!"
      : mood === "coach"
        ? "Vamos otra vez, tú puedes"
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
            Toca “Escuchar notas” para oír al director.
          </p>
        </div>
      </div>
    </div>
  );
}

const PUPIL_MAX = 3.2;

function DirectorBlob({ mood }: { mood: DirectorMood }) {
  const uid = useId().replace(/:/g, "");
  const bodyGrad = `blob-body-${uid}`;
  const glowGrad = `blob-glow-${uid}`;
  const shineGrad = `blob-shine-${uid}`;
  const rootRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<SVGGElement>(null);
  const pupilLRef = useRef<SVGGElement>(null);
  const pupilRRef = useRef<SVGGElement>(null);
  const [blink, setBlink] = useState(false);
  const [wink, setWink] = useState(false);
  const [wave, setWave] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => setReducedMotion(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  // Seguimiento del puntero (o mirada suave en movil) con rAF.
  useEffect(() => {
    if (reducedMotion) return;

    const finePointer = window.matchMedia("(pointer: fine)").matches;
    let raf = 0;
    let targetX = 0;
    let targetY = 0;
    let curX = 0;
    let curY = 0;
    let wanderT = 0;

    const apply = (x: number, y: number) => {
      const tx = x.toFixed(2);
      const ty = y.toFixed(2);
      pupilLRef.current?.setAttribute("transform", `translate(${tx} ${ty})`);
      pupilRRef.current?.setAttribute("transform", `translate(${tx} ${ty})`);
      if (bodyRef.current) {
        const tilt = (x / PUPIL_MAX) * 4;
        bodyRef.current.style.setProperty("--blob-tilt", `${tilt.toFixed(2)}deg`);
      }
    };

    const tick = (now: number) => {
      if (!finePointer) {
        wanderT = now * 0.00045;
        targetX = Math.sin(wanderT) * PUPIL_MAX * 0.7;
        targetY = Math.cos(wanderT * 0.85) * PUPIL_MAX * 0.45;
      }
      curX += (targetX - curX) * 0.14;
      curY += (targetY - curY) * 0.14;
      apply(curX, curY);
      raf = requestAnimationFrame(tick);
    };

    const onMove = (event: MouseEvent) => {
      const el = rootRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      const nx = (event.clientX - cx) / Math.max(rect.width * 0.9, 1);
      const ny = (event.clientY - cy) / Math.max(rect.height * 0.9, 1);
      const clamp = (v: number) => Math.max(-1, Math.min(1, v));
      targetX = clamp(nx) * PUPIL_MAX;
      targetY = clamp(ny) * PUPIL_MAX;
    };

    if (finePointer) {
      window.addEventListener("mousemove", onMove, { passive: true });
    }
    raf = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(raf);
      if (finePointer) window.removeEventListener("mousemove", onMove);
      pupilLRef.current?.setAttribute("transform", "translate(0, 0)");
      pupilRRef.current?.setAttribute("transform", "translate(0, 0)");
      bodyRef.current?.style.setProperty("--blob-tilt", "0deg");
    };
  }, [reducedMotion]);

  // Parpadeo aleatorio + microanimaciones ocasionales (saludo / guino).
  useEffect(() => {
    if (reducedMotion) return;
    let blinkTimer = 0;
    let microTimer = 0;
    let winkClear = 0;
    let waveClear = 0;

    const scheduleBlink = () => {
      const delay = 2200 + Math.random() * 3800;
      blinkTimer = window.setTimeout(() => {
        setBlink(true);
        window.setTimeout(() => setBlink(false), 140);
        scheduleBlink();
      }, delay);
    };

    const scheduleMicro = () => {
      const delay = 7000 + Math.random() * 9000;
      microTimer = window.setTimeout(() => {
        if (Math.random() > 0.45) {
          setWink(true);
          winkClear = window.setTimeout(() => setWink(false), 420);
        } else {
          setWave(true);
          waveClear = window.setTimeout(() => setWave(false), 900);
        }
        scheduleMicro();
      }, delay);
    };

    scheduleBlink();
    scheduleMicro();
    return () => {
      window.clearTimeout(blinkTimer);
      window.clearTimeout(microTimer);
      window.clearTimeout(winkClear);
      window.clearTimeout(waveClear);
    };
  }, [reducedMotion]);

  const eyeRy = mood === "celebrate" ? 5.2 : mood === "coach" ? 10.5 : 11.5;
  const eyeRx = mood === "celebrate" ? 11 : 11.5;
  const happyEyes = mood === "celebrate";
  const showSparkles = mood === "celebrate";

  return (
    <div
      ref={rootRef}
      className={[
        "director-blob relative w-36 h-36 mx-auto",
        `director-blob--${mood === "speaking" ? "speaking" : mood === "celebrate" ? "celebrate" : mood === "coach" ? "coach" : "idle"}`,
        blink ? "director-blob--blink" : "",
        wink ? "director-blob--wink" : "",
        wave ? "director-blob--wave" : "",
        reducedMotion ? "director-blob--reduced" : "",
      ]
        .filter(Boolean)
        .join(" ")}
      aria-hidden
    >
      <div className="director-blob__rings absolute inset-0 pointer-events-none" aria-hidden>
        <span className="director-blob__ring" />
        <span className="director-blob__ring director-blob__ring--2" />
        <span className="director-blob__ring director-blob__ring--3" />
      </div>

      {showSparkles && (
        <div className="director-blob__sparkles absolute inset-0 pointer-events-none z-[2]" aria-hidden>
          <span className="director-blob__spark director-blob__spark--1" />
          <span className="director-blob__spark director-blob__spark--2" />
          <span className="director-blob__spark director-blob__spark--3" />
        </div>
      )}

      <svg viewBox="0 0 160 160" className="relative z-[1] w-full h-full drop-shadow-lg">
        <defs>
          <radialGradient id={glowGrad} cx="50%" cy="42%" r="55%">
            <stop offset="0%" stopColor="oklch(0.88 0.16 70 / 0.55)" />
            <stop offset="70%" stopColor="oklch(0.78 0.14 60 / 0.12)" />
            <stop offset="100%" stopColor="oklch(0.16 0.01 50 / 0)" />
          </radialGradient>
          <linearGradient id={bodyGrad} x1="28%" y1="8%" x2="78%" y2="96%">
            <stop offset="0%" stopColor="oklch(0.92 0.1 78)" />
            <stop offset="42%" stopColor="oklch(0.8 0.15 62)" />
            <stop offset="100%" stopColor="oklch(0.64 0.13 55)" />
          </linearGradient>
          <radialGradient id={shineGrad} cx="34%" cy="26%" r="42%">
            <stop offset="0%" stopColor="oklch(1 0.02 90 / 0.62)" />
            <stop offset="100%" stopColor="oklch(1 0 0 / 0)" />
          </radialGradient>
        </defs>

        <circle cx="80" cy="80" r="72" fill={`url(#${glowGrad})`} />

        <g ref={bodyRef} className="director-blob__body">
          <path
            className="director-blob__silhouette"
            d="M80 26
               C106 26 128 44 130 70
               C132 94 118 116 96 126
               C86 131 74 132 62 127
               C40 118 28 96 30 72
               C32 46 54 26 80 26 Z"
            fill={`url(#${bodyGrad})`}
          />
          <ellipse cx="36" cy="80" rx="15" ry="19" fill={`url(#${bodyGrad})`} opacity="0.96" />
          <ellipse
            className="director-blob__arm"
            cx="124"
            cy="80"
            rx="15"
            ry="19"
            fill={`url(#${bodyGrad})`}
            opacity="0.96"
          />
          <ellipse cx="80" cy="40" rx="38" ry="30" fill={`url(#${shineGrad})`} />

          {/* Cejas suaves */}
          <g className="director-blob__brows">
            <path
              className="director-blob__brow director-blob__brow--l"
              d="M56 54 Q69 48 78 54"
              stroke="oklch(0.42 0.07 45)"
              strokeWidth="2.2"
              fill="none"
              strokeLinecap="round"
            />
            <path
              className="director-blob__brow director-blob__brow--r"
              d="M82 54 Q91 48 104 54"
              stroke="oklch(0.42 0.07 45)"
              strokeWidth="2.2"
              fill="none"
              strokeLinecap="round"
            />
          </g>

          {/* Ojos grandes */}
          <g className="director-blob__eyes">
            <g className="director-blob__eye director-blob__eye--l" transform="translate(68, 72)">
              {happyEyes ? (
                <path
                  d="M-10 2 Q0 -8 10 2"
                  stroke="oklch(0.28 0.04 50)"
                  strokeWidth="3"
                  fill="none"
                  strokeLinecap="round"
                />
              ) : (
                <>
                  <ellipse
                    className="director-blob__eye-white"
                    cx="0"
                    cy="0"
                    rx={eyeRx}
                    ry={eyeRy}
                    fill="oklch(0.99 0.01 95)"
                  />
                  <g ref={pupilLRef} className="director-blob__pupil-group">
                    <circle cx="0" cy="0.6" r="4.4" fill="oklch(0.24 0.04 50)" />
                    <circle cx="-1.4" cy="-1.6" r="1.55" fill="oklch(1 0 0 / 0.95)" />
                    <circle cx="1.6" cy="1.2" r="0.7" fill="oklch(1 0 0 / 0.45)" />
                  </g>
                </>
              )}
            </g>
            <g className="director-blob__eye director-blob__eye--r" transform="translate(92, 72)">
              {happyEyes ? (
                <path
                  d="M-10 2 Q0 -8 10 2"
                  stroke="oklch(0.28 0.04 50)"
                  strokeWidth="3"
                  fill="none"
                  strokeLinecap="round"
                />
              ) : (
                <>
                  <ellipse
                    className="director-blob__eye-white director-blob__eye-white--r"
                    cx="0"
                    cy="0"
                    rx={eyeRx}
                    ry={eyeRy}
                    fill="oklch(0.99 0.01 95)"
                  />
                  <g ref={pupilRRef} className="director-blob__pupil-group">
                    <circle cx="0" cy="0.6" r="4.4" fill="oklch(0.24 0.04 50)" />
                    <circle cx="-1.4" cy="-1.6" r="1.55" fill="oklch(1 0 0 / 0.95)" />
                    <circle cx="1.6" cy="1.2" r="0.7" fill="oklch(1 0 0 / 0.45)" />
                  </g>
                </>
              )}
            </g>
          </g>

          {/* Mejillas rosadas */}
          <ellipse
            className="director-blob__cheek"
            cx="52"
            cy="90"
            rx="8"
            ry="5"
            fill={mood === "coach" ? "oklch(0.78 0.1 25 / 0.42)" : "oklch(0.74 0.14 25 / 0.45)"}
          />
          <ellipse
            className="director-blob__cheek"
            cx="108"
            cy="90"
            rx="8"
            ry="5"
            fill={mood === "coach" ? "oklch(0.78 0.1 25 / 0.42)" : "oklch(0.74 0.14 25 / 0.45)"}
          />

          {/* Boca */}
          {mood === "speaking" ? (
            <ellipse
              className="director-blob__mouth-talk"
              cx="80"
              cy="100"
              rx="7.5"
              ry="6"
              fill="oklch(0.32 0.06 30)"
            />
          ) : mood === "celebrate" ? (
            <path
              d="M64 94 Q80 118 96 94"
              stroke="oklch(0.3 0.05 40)"
              strokeWidth="3.2"
              fill="none"
              strokeLinecap="round"
            />
          ) : mood === "coach" ? (
            <path
              d="M68 100 Q80 108 92 100"
              stroke="oklch(0.34 0.05 40)"
              strokeWidth="2.6"
              fill="none"
              strokeLinecap="round"
            />
          ) : (
            <path
              className="director-blob__smile"
              d="M66 96 Q80 112 94 96"
              stroke="oklch(0.3 0.05 40)"
              strokeWidth="2.8"
              fill="none"
              strokeLinecap="round"
            />
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
