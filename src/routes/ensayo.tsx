import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import {
  Square,
  Crown,
  Drama,
  Mic,
  MicOff,
  Volume2,
  SkipBack,
  SkipForward,
  RotateCcw,
  Play,
  Pause,
} from "lucide-react";
import { AppShell } from "@/components/AppShell";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { TopBar } from "@/components/TopBar";
import {
  getPerfilUsuario,
  updateRehearsalSession,
  type ScriptLineWithCharacter,
} from "@/lib/rehearsal-data";
import { requestRehearsalFeedback } from "@/lib/ai/request-rehearsal-feedback";
import { requestInterpretationAdvice } from "@/lib/ai/request-interpretation-advice";
import { collectInterpretationTakes } from "@/lib/ai/collect-interpretation-takes";
import {
  INTERPRETATION_DISCLAIMER,
  TERMS_VERSION,
  shouldRequestInterpretation,
} from "@/lib/ai/interpretation";
import { humanIdsFor, roleLabelFor, rolesForSession } from "@/lib/session-cast";
import {
  buildFeedback,
  canUseSpeechRecognition,
  canUseSpeechSynthesis,
  speechBrowserHint,
  effectiveMatchDifficulty,
  evaluateSpokenLine,
  listenForLine,
  resolveRehearsalVoice,
  scoreRehearsal,
  speakLine,
  isSpeechCancelled,
  stopSpeaking,
} from "@/lib/rehearsal-ai";
import {
  consolidateScriptLines,
  loadActiveRehearsal,
  loadRecentRehearsalsSafe,
  loadScriptSetupSafe,
  saveLocalReport,
  type ActiveRehearsal,
  type RehearsalLineNote,
} from "@/lib/rehearsal-runtime";
import { getDemoScriptSetup } from "@/lib/demo-script";
import {
  getGrabacionesGrupo,
  getGrupoParaScript,
  INDIVIDUAL_TAKE_GROUP,
  saveGrabacionGrupo,
} from "@/lib/grupos-api";
import { desktopNotice, isOfflineMode, sessionSuccess } from "@/lib/session-prefs";

export const Route = createFileRoute("/ensayo")({
  component: Ensayo,
});

function Wave({ active }: { active?: boolean }) {
  return (
    <div className="flex items-end gap-0.5 h-5">
      {Array.from({ length: 14 }).map((_, i) => (
        <span
          key={i}
          className={`w-0.5 rounded-full ${active ? "bg-primary" : "bg-muted-foreground/40"}`}
          style={{ height: `${30 + Math.sin(i) * 30 + (i % 3) * 20}%` }}
        />
      ))}
    </div>
  );
}

/** Nivel real del micrófono del turno (AnalyserNode), no una animación fija. */
function MicLevelMeter({ stream }: { stream: MediaStream | null }) {
  const [level, setLevel] = useState(0);

  useEffect(() => {
    if (!stream) {
      setLevel(0);
      return;
    }
    const context = new AudioContext();
    const source = context.createMediaStreamSource(stream);
    const analyser = context.createAnalyser();
    analyser.fftSize = 256;
    source.connect(analyser);
    const data = new Uint8Array(analyser.fftSize);
    let frame = 0;
    const tick = () => {
      analyser.getByteTimeDomainData(data);
      let sum = 0;
      for (let i = 0; i < data.length; i += 1) {
        const sample = (data[i] - 128) / 128;
        sum += sample * sample;
      }
      const rms = Math.min(1, Math.sqrt(sum / data.length) * 4);
      setLevel(rms);
      frame = window.requestAnimationFrame(tick);
    };
    frame = window.requestAnimationFrame(tick);
    return () => {
      window.cancelAnimationFrame(frame);
      source.disconnect();
      void context.close();
    };
  }, [stream]);

  return (
    <div className="mt-1 flex items-end gap-0.5 h-3" aria-hidden>
      {Array.from({ length: 12 }).map((_, index) => {
        const threshold = (index + 1) / 12;
        const on = level >= threshold * 0.85;
        return (
          <span
            key={index}
            className={`w-1 rounded-sm ${on ? "bg-primary" : "bg-muted-foreground/25"}`}
            style={{ height: `${30 + index * 6}%` }}
          />
        );
      })}
    </div>
  );
}

function Ensayo() {
  const nav = useNavigate();
  const listenRef = useRef<{ stop: () => void; reset: () => void } | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const lastTakeBlobRef = useRef<Blob | null>(null);
  const takeStartedAtRef = useRef<number>(0);
  const takeBlockRef = useRef<string | null>(null);
  const [lastTakeUrl, setLastTakeUrl] = useState<string | null>(null);
  const [groupAudioUrls, setGroupAudioUrls] = useState<Record<string, string>>({});
  const advancingRef = useRef(false);
  const scoresRef = useRef<number[]>([]);
  const skippedRef = useRef(0);
  const repeatedRef = useRef(0);
  const lineNotesRef = useRef<RehearsalLineNote[]>([]);
  const failedLineIdRef = useRef<string | null>(null);
  const finalEvalTimerRef = useRef<number | null>(null);
  const accumulatedFinalRef = useRef("");
  const playbackAudioRef = useRef<HTMLAudioElement | null>(null);
  const playbackTimerRef = useRef<number | null>(null);
  const isPausedRef = useRef(false);
  const listenGenerationRef = useRef(0);

  const [activeConfig, setActiveConfig] = useState<ActiveRehearsal | null>(null);
  const [sessionReady, setSessionReady] = useState(false);
  useEffect(() => {
    setActiveConfig(loadActiveRehearsal());
    setSessionReady(true);
  }, []);
  const [connectionStatus, setConnectionStatus] = useState(
    "El botón redondo inicia o pausa el ensayo.",
  );
  const [isRehearsing, setIsRehearsing] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [confirmFinish, setConfirmFinish] = useState(false);
  const [closingMessage, setClosingMessage] = useState<string | null>(null);
  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [activeLineIndex, setActiveLineIndex] = useState(0);
  const [transcript, setTranscript] = useState("");
  const [typedLine, setTypedLine] = useState("");
  const [lastScore, setLastScore] = useState<number | null>(null);
  const [micStream, setMicStream] = useState<MediaStream | null>(null);

  const { data: latest, isLoading: rehearsalLoading } = useQuery({
    queryKey: ["latest-rehearsal-v2"],
    queryFn: () => loadRecentRehearsalsSafe(1).then((rows) => rows[0] ?? null),
    enabled: sessionReady && !activeConfig,
  });
  const scriptId = activeConfig?.scriptId ?? latest?.script_id ?? undefined;
  const sceneId = activeConfig?.sceneId ?? latest?.scene_id ?? undefined;
  const { data: setup, isLoading: setupLoading } = useQuery({
    queryKey: ["script-setup-v2", scriptId, sceneId],
    queryFn: () => loadScriptSetupSafe(scriptId, sceneId),
    placeholderData: getDemoScriptSetup(),
  });
  const { data: profileData } = useQuery({
    queryKey: ["perfil-usuario"],
    queryFn: getPerfilUsuario,
  });
  const preferredVoice = profileData?.profile?.preferred_voice ?? null;

  const loading = (rehearsalLoading && !activeConfig) || setupLoading;
  const lines = useMemo(() => consolidateScriptLines(setup?.lines ?? []), [setup?.lines]);
  const currentLine = lines[activeLineIndex] ?? null;
  const nextLine = lines[activeLineIndex + 1] ?? null;
  const afterLine = lines[activeLineIndex + 2] ?? null;
  const selectedCharacterId =
    activeConfig?.selectedCharacterId ?? latest?.selected_character_id ?? null;
  const selectedCharacter =
    setup?.characters.find((item) => item.id === selectedCharacterId) ??
    latest?.selectedCharacter ??
    null;
  const difficulty = activeConfig?.aiDifficulty ?? latest?.ai_difficulty ?? 50;
  const allowImprov = activeConfig?.allowImprov ?? latest?.allow_improv ?? true;
  const suggestEmotions = activeConfig?.suggestEmotions ?? latest?.suggest_emotions ?? true;
  const matchDifficulty = effectiveMatchDifficulty(difficulty, allowImprov);
  const mode = activeConfig?.mode ?? latest?.mode ?? "individual";
  const isGrupoMode = mode === "grupo";
  const isLecturaMode = mode === "lectura";
  const grupoId = activeConfig?.grupoId ?? null;
  const useProfileVoiceForAll = activeConfig?.useProfileVoiceForAll ?? false;
  const total = lines.length || latest?.total_lines || 1;
  const completed = Math.min(total, Math.max(activeLineIndex, scoresRef.current.length));
  const progress = Math.min(100, Math.round((completed / total) * 100));
  const sessionRoles = useMemo(
    () =>
      rolesForSession({
        selectedCharacterId,
        sessionCast: activeConfig?.sessionCast,
      }),
    [selectedCharacterId, activeConfig?.sessionCast],
  );
  const isMyTurn = Boolean(currentLine && currentLine.character_id === selectedCharacterId);
  const turnLabel = roleLabelFor(currentLine?.character_id, sessionRoles);
  const humanTurnLabel = turnLabel === "voz" ? null : turnLabel;
  const isHumanTurn = Boolean(humanTurnLabel);
  const speechOk = canUseSpeechRecognition() && canUseSpeechSynthesis();
  const humanCharacterIds = useMemo(() => humanIdsFor(sessionRoles), [sessionRoles]);
  const userLinesTotal = useMemo(
    () =>
      lines.filter((line) => line.character_id && humanCharacterIds.has(line.character_id)).length,
    [lines, humanCharacterIds],
  );

  const stopTake = () => {
    const recorder = recorderRef.current;
    if (recorder && recorder.state !== "inactive") recorder.stop();
    recorderRef.current = null;
    setMicStream(null);
  };

  const stopTakeAndGetBlob = () =>
    new Promise<Blob | null>((resolve) => {
      const recorder = recorderRef.current;
      if (!recorder || recorder.state === "inactive") {
        resolve(lastTakeBlobRef.current);
        return;
      }
      const stream = recorder.stream;
      recorder.ondataavailable = (event) => {
        if (event.data.size) chunksRef.current.push(event.data);
      };
      recorder.onstop = () => {
        stream.getTracks().forEach((track) => track.stop());
        recorderRef.current = null;
        if (!chunksRef.current.length) {
          resolve(lastTakeBlobRef.current);
          return;
        }
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || "audio/webm" });
        lastTakeBlobRef.current = blob;
        setLastTakeUrl((prev) => {
          if (prev) URL.revokeObjectURL(prev);
          return URL.createObjectURL(blob);
        });
        resolve(blob);
      };
      recorder.stop();
    });

  const startTake = async () => {
    stopTake();
    lastTakeBlobRef.current = null;
    if (!navigator.mediaDevices?.getUserMedia) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      chunksRef.current = [];
      takeStartedAtRef.current = Date.now();
      recorder.ondataavailable = (event) => {
        if (event.data.size) chunksRef.current.push(event.data);
      };
      recorder.onstop = () => {
        stream.getTracks().forEach((track) => track.stop());
        if (!chunksRef.current.length) return;
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || "audio/webm" });
        lastTakeBlobRef.current = blob;
        setLastTakeUrl((prev) => {
          if (prev) URL.revokeObjectURL(prev);
          return URL.createObjectURL(blob);
        });
      };
      recorder.start();
      recorderRef.current = recorder;
      setMicStream(stream);
      takeBlockRef.current = null;
    } catch (error) {
      const name = error instanceof DOMException ? error.name : "";
      takeBlockRef.current =
        name === "NotAllowedError" || name === "NotFoundError"
          ? "el micrófono no permitió grabar"
          : "no hubo tomas de audio válidas";
    }
  };

  const stopPlaybackAudio = () => {
    if (playbackTimerRef.current != null) {
      window.clearTimeout(playbackTimerRef.current);
      playbackTimerRef.current = null;
    }
    const audio = playbackAudioRef.current;
    playbackAudioRef.current = null;
    if (!audio) return;
    audio.onended = null;
    audio.onerror = null;
    audio.pause();
  };
  const stopPlaybackAudioRef = useRef(stopPlaybackAudio);
  stopPlaybackAudioRef.current = stopPlaybackAudio;

  const playAudioUrl = (url: string) =>
    new Promise<void>((resolve) => {
      stopPlaybackAudio();
      const audio = new Audio(url);
      playbackAudioRef.current = audio;
      let done = false;
      const finish = () => {
        if (done) return;
        done = true;
        if (playbackTimerRef.current != null) {
          window.clearTimeout(playbackTimerRef.current);
          playbackTimerRef.current = null;
        }
        if (playbackAudioRef.current === audio) playbackAudioRef.current = null;
        resolve();
      };
      playbackTimerRef.current = window.setTimeout(finish, 20_000);
      audio.onended = finish;
      audio.onerror = finish;
      void audio.play().catch(finish);
    });

  useEffect(() => {
    const sid = activeConfig?.scriptId ?? latest?.script_id;
    if (!sid) {
      setGroupAudioUrls({});
      return;
    }
    const takeGroupId = isGrupoMode ? grupoId : INDIVIDUAL_TAKE_GROUP;
    if (isGrupoMode && !takeGroupId) {
      setGroupAudioUrls({});
      return;
    }
    let cancelled = false;
    const created: string[] = [];
    void getGrabacionesGrupo(sid, takeGroupId)
      .then((urls) => {
        if (cancelled) {
          Object.values(urls).forEach((url) => URL.revokeObjectURL(url));
          return;
        }
        created.push(...Object.values(urls));
        setGroupAudioUrls(urls);
      })
      .catch(() => {
        if (!cancelled) setGroupAudioUrls({});
      });
    return () => {
      cancelled = true;
      created.forEach((url) => URL.revokeObjectURL(url));
    };
  }, [isGrupoMode, activeConfig?.scriptId, latest?.script_id, grupoId]);

  const persistTake = async (line: ScriptLineWithCharacter, blob: Blob | null) => {
    if (!blob?.size || !line.id) return;
    const sid = activeConfig?.scriptId ?? setup?.script?.id ?? latest?.script_id;
    if (!sid) return;
    let resolvedGrupoId = isGrupoMode ? grupoId : INDIVIDUAL_TAKE_GROUP;
    if (isGrupoMode && !resolvedGrupoId) {
      try {
        resolvedGrupoId = (await getGrupoParaScript(sid))?.grupoId ?? null;
      } catch {
        return;
      }
    }
    if (!resolvedGrupoId) return;
    try {
      const saved = await saveGrabacionGrupo({
        grupoId: resolvedGrupoId,
        scriptId: sid,
        sceneId: activeConfig?.sceneId ?? setup?.scene?.id ?? latest?.scene_id ?? null,
        sceneTitle: setup?.scene?.title ?? null,
        lineId: line.id,
        characterId: line.character_id,
        characterName: line.character?.name ?? selectedCharacter?.name ?? "Actor",
        blob,
        durationSec: takeStartedAtRef.current
          ? Math.max(0, (Date.now() - takeStartedAtRef.current) / 1000)
          : null,
      });
      setGroupAudioUrls((prev) => {
        const next = { ...prev };
        if (prev[line.id]) URL.revokeObjectURL(prev[line.id]);
        next[line.id] = saved.audioUrl;
        return next;
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (/quota|almacenamiento|storage|QuotaExceeded/i.test(message)) {
        toast.error(message);
      }
      // La toma local sigue disponible aunque no se pueda persistir.
    }
  };

  const stopListen = () => {
    listenGenerationRef.current += 1;
    if (finalEvalTimerRef.current != null) {
      window.clearTimeout(finalEvalTimerRef.current);
      finalEvalTimerRef.current = null;
    }
    accumulatedFinalRef.current = "";
    listenRef.current?.stop();
    listenRef.current = null;
    setIsListening(false);
    stopTake();
  };
  const stopListenRef = useRef(stopListen);
  stopListenRef.current = stopListen;

  const recordLineNote = (
    line: ScriptLineWithCharacter | undefined,
    opts?: {
      skipped?: boolean;
      score?: number;
      spoken?: string | null;
      attempt?: number | null;
      failed?: boolean;
      unreached?: boolean;
    },
  ) => {
    if (!line) return;
    lineNotesRef.current.push({
      lineId: line.id,
      order: lineNotesRef.current.length + 1,
      characterName: line.character?.name ?? selectedCharacter?.name ?? "Actor",
      text: line.text,
      skipped: Boolean(opts?.skipped),
      score: typeof opts?.score === "number" ? opts.score : null,
      spoken: opts?.spoken ?? null,
      attempt: opts?.attempt ?? null,
      failed: Boolean(opts?.failed),
      unreached: Boolean(opts?.unreached),
    });
  };

  const finishRehearsal = async (reason: "done" | "manual") => {
    isPausedRef.current = false;
    setIsPaused(false);
    stopListen();
    stopSpeaking();
    stopPlaybackAudio();
    setIsRehearsing(false);
    setIsSpeaking(false);

    const skipped = skippedRef.current;
    const repeated = repeatedRef.current;
    if (reason === "manual" && !isLecturaMode) {
      const acceptedIds = new Set(
        lineNotesRef.current
          .filter((note) => !note.failed && !note.unreached && typeof note.score === "number")
          .map((note) => note.lineId),
      );
      for (const line of lines) {
        if (!line.character_id || !humanCharacterIds.has(line.character_id)) continue;
        if (acceptedIds.has(line.id)) continue;
        recordLineNote(line, { skipped: true, score: 0, unreached: true });
      }
    }
    const completedLines = Math.min(lines.length, activeLineIndex + (reason === "done" ? 1 : 0));
    const userLinesCompleted = scoresRef.current.length;
    const isLectura = mode === "lectura";
    // Modo lectura: no puntua memorizacion; se guarda como "lectura" en el historial.
    const scored = isLectura
      ? {
          memorization: 0,
          clarity: 0,
          expression: 0,
          rhythm: 0,
          projection: 0,
          score: 0,
        }
      : scoreRehearsal({
          userLineScores: scoresRef.current,
          skipped,
          repeated,
          userLinesCompleted,
          userLinesTotal: userLinesTotal || Math.max(1, userLinesCompleted),
        });
    const { memorization, clarity, expression, rhythm, projection, score } = scored;
    const endedAt = new Date().toISOString();
    const fallbackFeedback = isLectura
      ? "Modo lectura: se reprodujeron las líneas sin evaluar memorización."
      : buildFeedback({
          memorization,
          completed: completedLines,
          total: lines.length,
          skipped,
        });
    let feedback = fallbackFeedback;
    let feedbackSource: "gemini" | "local" = "local";
    let feedbackModel: string | null = null;
    let feedbackReason: string | null = isOfflineMode() ? "no hay conexión" : null;
    // Lectura: no pedir notas de director al modelo (no hay memorizacion que evaluar).
    const wantsAiNotes = !isLectura && activeConfig?.feedbackEnabled !== false && !isOfflineMode();
    if (wantsAiNotes) {
      try {
        const notes = await requestRehearsalFeedback({
          data: {
            scriptTitle: setup?.script?.title ?? "Sin libreto",
            sceneTitle: setup?.scene?.title ?? "Sin escena",
            characterName: selectedCharacter?.name ?? "Actor",
            memorization,
            completed: completedLines,
            total: lines.length,
            skipped,
            difficulty,
            mode,
          },
        });
        if (notes?.text) {
          // La fuente sigue al texto mostrado; no la reescribimos después.
          feedback = notes.text;
          feedbackSource = notes.source === "gemini" ? "gemini" : "local";
          feedbackModel = notes.model ?? null;
          feedbackReason = notes.reason ?? null;
        }
      } catch {
        feedback = fallbackFeedback;
        feedbackSource = "local";
        feedbackReason = "no hay conexión";
      }
    }

    let interpretation: {
      disclaimer: string;
      notice: string | null;
      source: string;
      model: string | null;
      reason: string | null;
      lines: Array<{
        lineId: string;
        detectedExpressions: Array<{ name: string; score: number }>;
        expectedEmotion: string;
        alignment: string;
        tips: string;
        intonation?: string;
        pauses?: string;
        volume?: string;
        rhythm?: string;
        intention?: string;
      }>;
    } | null = null;
    const profile = profileData?.profile;
    const takeScriptId = activeConfig?.scriptId ?? setup?.script?.id ?? latest?.script_id ?? null;
    const takeSceneId = activeConfig?.sceneId ?? setup?.scene?.id ?? latest?.scene_id ?? null;
    const takeGroupId = isGrupoMode ? grupoId : INDIVIDUAL_TAKE_GROUP;
    const spokenByLine = new Map(
      lineNotesRef.current.map((note) => [note.lineId, note.spoken ?? ""]),
    );
    const interpretationLines = lines
      .filter((line) => line.character_id && humanCharacterIds.has(line.character_id))
      .map((line) => ({
        lineId: line.id,
        text: line.text,
        cue: line.cue ?? "",
        baseEmotion: line.character?.base_emotion ?? "",
        spoken: spokenByLine.get(line.id) ?? "",
      }));
    const wantsInterpretation =
      Boolean(takeScriptId && takeGroupId && profile?.user_id && profile.user_id !== "guest") &&
      shouldRequestInterpretation({
        mode,
        termsAccepted: profile?.terms_version === TERMS_VERSION,
        audioEnabled: profile?.interpretation_audio_enabled !== false,
        offline: isOfflineMode(),
        hasTakes: interpretationLines.length > 0,
      });
    if (wantsInterpretation && takeScriptId && takeGroupId && profile?.user_id) {
      setClosingMessage("Analizando la interpretación…");
      try {
        const collected = await collectInterpretationTakes({
          scriptId: takeScriptId,
          sceneId: takeSceneId,
          grupoId: takeGroupId,
          userId: profile.user_id,
          sceneTitle: setup?.scene?.title ?? "",
          lines: interpretationLines,
        });
        if (collected.takes.length > 0) {
          const result = await requestInterpretationAdvice({ data: { takes: collected.takes } });
          interpretation = result.advice ?? null;
          if (interpretation && collected.notice && !interpretation.notice) {
            interpretation = { ...interpretation, notice: collected.notice };
          }
        } else {
          const reason =
            takeBlockRef.current ?? collected.dropReason ?? "no hubo tomas de audio válidas";
          interpretation = {
            disclaimer: INTERPRETATION_DISCLAIMER,
            notice: reason,
            source: "template",
            model: null,
            reason,
            lines: [],
          };
        }
      } catch {
        interpretation = {
          disclaimer: INTERPRETATION_DISCLAIMER,
          notice: "no hay conexión",
          source: "template",
          model: null,
          reason: "no hay conexión",
          lines: [],
        };
      }
    } else if (
      !isLectura &&
      profile?.terms_version === TERMS_VERSION &&
      profile.interpretation_audio_enabled !== false &&
      isOfflineMode()
    ) {
      interpretation = {
        disclaimer: INTERPRETATION_DISCLAIMER,
        notice: "no hay conexión",
        source: "template",
        model: null,
        reason: "no hay conexión",
        lines: [],
      };
    }

    try {
      saveLocalReport(
        {
          scriptTitle: setup?.script?.title ?? "Sin libreto",
          sceneTitle: setup?.scene?.title ?? "Sin escena",
          sceneLocation: setup?.scene?.location ?? setup?.scene?.description ?? null,
          characterName: selectedCharacter?.name ?? "Actor",
          mode,
          aiDifficulty: difficulty,
          startedAt: activeConfig?.startedAt ?? latest?.started_at ?? endedAt,
          endedAt,
          completedLines,
          totalLines: lines.length,
          skippedLines: skipped,
          repeatedLines: repeated,
          memorization,
          clarity,
          expression,
          rhythm,
          projection,
          score,
          feedback,
          feedbackSource,
          feedbackModel,
          feedbackReason,
          lineNotes: [...lineNotesRef.current],
          interpretation,
        },
        {
          script: setup?.script ?? null,
          scene: setup?.scene ?? null,
          selectedCharacter,
          scriptId: activeConfig?.scriptId ?? setup?.script?.id ?? null,
          sceneId: activeConfig?.sceneId ?? setup?.scene?.id ?? null,
          characterId: selectedCharacterId,
        },
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (/quota|almacenamiento|storage|QuotaExceeded/i.test(message)) {
        toast.error(message);
      } else {
        toast.error("No se pudo guardar el historial; el resumen se muestra igual.");
      }
    }

    if (activeConfig?.supabaseSessionId) {
      void updateRehearsalSession(activeConfig.supabaseSessionId, {
        status: "completed",
        ended_at: endedAt,
        completed_lines: completedLines,
        total_lines: lines.length,
        skipped_lines: skipped,
        repeated_lines: repeated,
        memorization_score: memorization,
        clarity_score: clarity,
        expression_score: expression,
        rhythm_score: rhythm,
        projection_score: projection,
        score,
        feedback_summary: feedback,
        teleprompter_status: "stopped",
        teleprompter_last_event:
          reason === "done" ? "Escena completada con voz del navegador." : "Ensayo finalizado.",
      }).catch(() => null);
    }

    sessionSuccess(
      reason === "done" ? "Ensayo guardado en tu historial." : "Ensayo finalizado y guardado.",
    );
    desktopNotice("Ensaya IA", "Tu ensayo quedó guardado en el historial.");
    nav({ to: "/finalizado" });
  };

  const advance = (opts?: { skipped?: boolean; score?: number }) => {
    if (advancingRef.current) return;
    advancingRef.current = true;
    stopListen();
    stopSpeaking();
    stopPlaybackAudio();
    setIsSpeaking(false);
    setTranscript("");
    failedLineIdRef.current = null;

    recordLineNote(currentLine, opts);

    if (opts?.skipped) skippedRef.current += 1;
    if (typeof opts?.score === "number") {
      scoresRef.current.push(opts.score);
      setLastScore(opts.score);
    }

    setActiveLineIndex((prev) => {
      if (prev >= lines.length - 1) {
        window.setTimeout(() => {
          void finishRehearsal("done");
        }, 50);
        return prev;
      }
      return prev + 1;
    });

    // El candado solo evita un doble avance en el mismo instante.
    // No debe impedir que el efecto lea la línea nueva: se suelta en el siguiente tick.
    window.setTimeout(() => {
      advancingRef.current = false;
    }, 0);
  };

  const applySpokenText = (text: string, fromTyping = false) => {
    if (isPausedRef.current || !currentLine) return false;
    const verdict = evaluateSpokenLine(text, currentLine.text, matchDifficulty);
    setTranscript(text);
    setLastScore(verdict.score);
    if (verdict.accepted) {
      setConnectionStatus(`Linea reconocida (${verdict.percent}%).`);
      sessionSuccess("Tu línea coincidió con el libreto");
      setTypedLine("");
      const line = currentLine;
      void (async () => {
        const blob = await stopTakeAndGetBlob();
        await persistTake(line, blob);
        advance({ score: verdict.score });
      })();
      return true;
    }
    // Solo intentos finales fallidos: el segundo fallo FINAL de la misma linea = repeticion.
    const attempt =
      lineNotesRef.current.filter((note) => note.lineId === currentLine.id && note.failed).length +
      1;
    if (failedLineIdRef.current === currentLine.id) {
      repeatedRef.current += 1;
    } else {
      failedLineIdRef.current = currentLine.id;
    }
    recordLineNote(currentLine, {
      score: verdict.score,
      spoken: text,
      attempt,
      failed: true,
    });
    // Nuevo intento de la misma linea: limpia acumulado STT para comparar por separado.
    accumulatedFinalRef.current = "";
    listenRef.current?.reset();
    if (verdict.close || fromTyping) {
      setConnectionStatus(
        `Casi... ${verdict.percent}%. Sigue hablando o escribe las palabras clave.`,
      );
    }
    return false;
  };

  useEffect(() => {
    if (!isRehearsing || isPaused || !currentLine) return;

    // Modo lectura: TTS de todas las lineas, sin exigir microfono para avanzar.
    if (isLecturaMode) {
      const character = currentLine.character;
      const emotionHint =
        suggestEmotions && character?.base_emotion ? ` · emocion: ${character.base_emotion}` : "";
      setConnectionStatus(
        isMyTurn
          ? `Lectura: tu línea (${character?.name ?? "Tú"})${emotionHint}`
          : `Lectura: ${character?.name ?? "Voz"}${emotionHint}`,
      );
      setIsSpeaking(true);
      setIsListening(false);
      stopListen();

      let cancelled = false;
      const voice = resolveRehearsalVoice({
        preferredVoice,
        characterVoice: character?.voice,
        useProfileVoiceForAll,
      });
      void speakLine(currentLine.text, voice, {
        emotion: character?.base_emotion,
        applyEmotion: suggestEmotions,
      })
        .then(() => {
          if (cancelled) return;
          setIsSpeaking(false);
          // Lectura: avanzar sin puntuar memorizacion.
          advance();
        })
        .catch((error) => {
          if (cancelled || isSpeechCancelled(error)) return;
          setIsSpeaking(false);
          setConnectionStatus(error instanceof Error ? error.message : "No se pudo leer la línea.");
        });

      return () => {
        cancelled = true;
        setIsSpeaking(false);
        stopSpeaking();
        stopPlaybackAudio();
      };
    }

    if (isHumanTurn) {
      setIsSpeaking(false);
      stopSpeaking();
      if (!canUseSpeechRecognition()) {
        setConnectionStatus(
          "Este navegador no reconoce voz. Usa Chrome o Edge en una conexión segura (HTTPS), o avanza la línea a mano.",
        );
        return;
      }
      setConnectionStatus(
        humanTurnLabel === "Tú"
          ? "Tu turno. Di la línea en voz alta."
          : `Turno de ${turnLabel}. Pasa el micrófono.`,
      );
      stopListen();
      void startTake();
      accumulatedFinalRef.current = "";
      const generation = listenGenerationRef.current;
      const handle = listenForLine({
        onTranscript: (text, isFinal) => {
          if (generation !== listenGenerationRef.current || isPausedRef.current) return;
          // Interinos solo actualizan el teleprompter.
          if (!isFinal) {
            setTranscript(text);
            return;
          }
          // Acumula pedazos finales de la misma linea y evalua tras una pausa,
          // para no contar cada fragmento de una linea larga como repeticion.
          accumulatedFinalRef.current = text;
          setTranscript(text);
          if (finalEvalTimerRef.current != null) {
            window.clearTimeout(finalEvalTimerRef.current);
          }
          finalEvalTimerRef.current = window.setTimeout(() => {
            finalEvalTimerRef.current = null;
            if (generation !== listenGenerationRef.current || isPausedRef.current) return;
            const attempt = accumulatedFinalRef.current;
            // Reinicia antes de evaluar el siguiente intento de la misma linea.
            accumulatedFinalRef.current = "";
            listenRef.current?.reset();
            applySpokenText(attempt);
          }, 1200);
        },
        onError: (message) => {
          setConnectionStatus(message);
          toast.error(message, { id: "ensayo-microfono" });
        },
      });
      listenRef.current = handle;
      setIsListening(Boolean(handle));
      return () => {
        if (finalEvalTimerRef.current != null) {
          window.clearTimeout(finalEvalTimerRef.current);
          finalEvalTimerRef.current = null;
        }
        handle?.stop();
        setIsListening(false);
        stopTake();
      };
    }

    const character = currentLine.character;
    const savedUrl = groupAudioUrls[currentLine.id];
    const emotionHint =
      suggestEmotions && character?.base_emotion ? ` · emocion: ${character.base_emotion}` : "";
    setConnectionStatus(
      savedUrl
        ? `${character?.name ?? "Actor"} (grabacion del grupo)${emotionHint}...`
        : `${character?.name ?? "Voz"} está leyendo su línea${emotionHint}...`,
    );
    setIsSpeaking(true);
    setIsListening(false);
    stopListen();

    let cancelled = false;
    const voice = resolveRehearsalVoice({
      preferredVoice,
      characterVoice: character?.voice,
      useProfileVoiceForAll,
    });
    const playback = savedUrl
      ? playAudioUrl(savedUrl)
      : speakLine(currentLine.text, voice, {
          emotion: character?.base_emotion,
          applyEmotion: suggestEmotions,
        });

    void playback
      .then(() => {
        if (cancelled) return;
        setIsSpeaking(false);
        // Lineas de IA / otros personajes: avanzar sin empujar score 1.
        advance();
      })
      .catch((error) => {
        if (cancelled || isSpeechCancelled(error)) return;
        setIsSpeaking(false);
        setConnectionStatus(
          error instanceof Error
            ? error.message
            : "No se pudo leer la línea con la voz del navegador.",
        );
      });

    return () => {
      cancelled = true;
      setIsSpeaking(false);
      stopSpeaking();
      stopPlaybackAudio();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    isRehearsing,
    isPaused,
    activeLineIndex,
    currentLine?.id,
    isHumanTurn,
    humanTurnLabel,
    isLecturaMode,
    preferredVoice,
    suggestEmotions,
    useProfileVoiceForAll,
  ]);

  useEffect(() => {
    return () => {
      stopListenRef.current();
      stopSpeaking();
      stopPlaybackAudioRef.current();
    };
  }, []);

  const pauseRehearsal = () => {
    if (!isRehearsing || isPausedRef.current) return;
    isPausedRef.current = true;
    stopListen();
    stopSpeaking();
    stopPlaybackAudio();
    setIsSpeaking(false);
    setIsListening(false);
    setIsPaused(true);
    setConnectionStatus("En pausa");
  };

  const resumeRehearsal = () => {
    if (!isRehearsing || !isPausedRef.current) return;
    isPausedRef.current = false;
    setIsPaused(false);
  };

  const pauseRehearsalRef = useRef(pauseRehearsal);
  const resumeRehearsalRef = useRef(resumeRehearsal);
  pauseRehearsalRef.current = pauseRehearsal;
  resumeRehearsalRef.current = resumeRehearsal;

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== " " && event.code !== "Space") return;
      if (event.repeat || confirmFinish) return;
      const target = event.target;
      if (target instanceof HTMLElement) {
        const tag = target.tagName;
        if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || target.isContentEditable) {
          return;
        }
      }
      if (!isRehearsing) return;
      event.preventDefault();
      if (isPausedRef.current) resumeRehearsalRef.current();
      else pauseRehearsalRef.current();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [confirmFinish, isRehearsing]);

  const handleToggleRecording = () => {
    if (isRehearsing) {
      if (isPaused) resumeRehearsal();
      else pauseRehearsal();
      return;
    }

    if (isLecturaMode) {
      if (typeof window !== "undefined") {
        window.speechSynthesis.getVoices();
      }
      isPausedRef.current = false;
      setIsPaused(false);
      lineNotesRef.current = [];
      setIsRehearsing(true);
      setConnectionStatus("Lectura iniciada. Se leen todas las líneas en voz alta.");
      sessionSuccess("Modo lectura: sin micrófono para avanzar.");
      return;
    }

    if (!speechOk) {
      toast.error(speechBrowserHint());
    }

    if (typeof window !== "undefined") {
      window.speechSynthesis.getVoices();
    }
    isPausedRef.current = false;
    setIsPaused(false);
    lineNotesRef.current = [];
    setIsRehearsing(true);
    setConnectionStatus("Ensayo iniciado. Los demás papeles se leen con la voz del navegador.");
    sessionSuccess("Ensayo iniciado. Los demás papeles se leen con la voz de tu navegador.");
  };

  const handleSkipForward = () => {
    if (activeLineIndex >= lines.length - 1) {
      recordLineNote(currentLine, { skipped: isHumanTurn && !isLecturaMode });
      if (isHumanTurn && !isLecturaMode) skippedRef.current += 1;
      void finishRehearsal("done");
      return;
    }
    advance({ skipped: isHumanTurn && !isLecturaMode });
  };

  const handleSkipBackward = () => {
    stopListen();
    stopSpeaking();
    stopPlaybackAudio();
    setIsSpeaking(false);
    setTranscript("");
    repeatedRef.current += 1;
    failedLineIdRef.current = null;
    setActiveLineIndex((prev) => Math.max(0, prev - 1));
  };

  const handleReset = () => {
    isPausedRef.current = false;
    stopListen();
    stopSpeaking();
    stopPlaybackAudio();
    scoresRef.current = [];
    skippedRef.current = 0;
    repeatedRef.current = 0;
    lineNotesRef.current = [];
    failedLineIdRef.current = null;
    setActiveLineIndex(0);
    setTranscript("");
    setTypedLine("");
    setLastScore(null);
    setIsRehearsing(false);
    setIsPaused(false);
    setIsSpeaking(false);
    setConnectionStatus("Escena reiniciada. Pulsa el micrófono para volver a empezar.");
  };

  const submitTypedLine = () => {
    if (!isRehearsing || isPaused || !isHumanTurn || !currentLine || isLecturaMode) return;
    const text = typedLine.trim();
    if (!text) return;
    applySpokenText(text, true);
  };

  return (
    <AppShell>
      <TopBar
        back={{ to: "/", label: "Modo ensayo", className: "text-brand hover:text-primary" }}
      />
      {closingMessage ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-background/80 px-6">
          <p className="rounded-xl border border-border/60 bg-card px-5 py-4 text-sm">
            {closingMessage}
          </p>
        </div>
      ) : null}
      <AlertDialog open={confirmFinish} onOpenChange={setConfirmFinish}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Finalizar el ensayo?</AlertDialogTitle>
            <AlertDialogDescription>Se guardará tu avance hasta esta línea.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:opacity-90"
              onClick={() => void finishRehearsal("manual")}
            >
              Finalizar ensayo
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {loading && (
        <div className="bg-card border border-border/60 rounded-xl p-4 mb-5 text-sm text-muted-foreground">
          Cargando escena...
        </div>
      )}

      {!speechOk && !isLecturaMode && (
        <div className="bg-card border border-primary/40 rounded-xl p-4 mb-5 text-sm text-muted-foreground">
          Para voz y micrófono, usa Chrome o Edge en una conexión segura (HTTPS). Puedes avanzar
          líneas a mano si el reconocimiento no está disponible.
        </div>
      )}

      <div className="bg-card border border-border/60 rounded-xl p-4 flex flex-wrap items-center gap-6 mb-5">
        <div>
          <div className="flex items-center gap-2">
            <span className="font-display text-lg">{setup?.script?.title ?? "Sin libreto"}</span>
            <span className="text-xs px-2 py-0.5 rounded-full border border-primary/40 text-primary">
              {setup?.scene?.title ?? "Sin escena"}
            </span>
          </div>
          <div className="text-xs text-muted-foreground mt-0.5">
            {setup?.scene?.location ?? setup?.scene?.description ?? "Escena lista para ensayar"}
          </div>
        </div>
        <div className="flex items-center gap-2 ml-auto sm:ml-0">
          <Crown className="w-5 h-5 text-primary" />
          <div>
            <div className="text-[10px] tracking-[0.2em] text-muted-foreground uppercase">
              Interpretas
            </div>
            <div className="text-sm">
              {selectedCharacter ? `${selectedCharacter.name} (Tu)` : "Sin personaje"}
            </div>
          </div>
        </div>
        <div className="text-xs leading-relaxed">
          <div className="text-[10px] tracking-[0.2em] text-muted-foreground uppercase mb-0.5">
            Modo
          </div>
          <div>
            Realismo: <span className="text-primary">{difficultyLabel(difficulty)}</span>
          </div>
          <div>
            Ritmo: <span className="text-primary">{modeLabel(mode)}</span>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setConfirmFinish(true)}
          className="ml-auto inline-flex items-center gap-2 bg-destructive text-destructive-foreground rounded-lg px-3 py-2 text-sm hover:opacity-90"
        >
          <Square className="w-3.5 h-3.5 fill-current" /> Finalizar ensayo
        </button>
      </div>

      <div className="grid lg:grid-cols-[1fr_300px] gap-5">
        <div className="space-y-4">
          <LineCard
            title="Línea actual"
            line={currentLine}
            roles={sessionRoles}
            active
            speaking={isSpeaking && !isHumanTurn}
          />
          <LineCard title="Siguiente línea" line={nextLine} roles={sessionRoles} />
          <LineCard title="Después" line={afterLine} roles={sessionRoles} faded />

          <div className="bg-card border border-border/60 rounded-xl p-4 mt-6 flex flex-wrap items-center justify-between gap-4">
            <div className="text-xs">
              <div
                className={`flex items-center gap-1.5 ${isPaused ? "text-foreground" : isListening ? "text-primary" : isSpeaking ? "text-foreground" : "text-muted-foreground"}`}
              >
                <span
                  className={`w-1.5 h-1.5 rounded-full ${
                    isPaused
                      ? "bg-foreground"
                      : isListening
                        ? "bg-primary animate-pulse"
                        : isSpeaking
                          ? "bg-foreground"
                          : "bg-muted-foreground/50"
                  }`}
                />{" "}
                {isPaused
                  ? "En pausa"
                  : isSpeaking
                    ? "Voz del navegador"
                    : isListening
                      ? "Escuchando…"
                      : isRehearsing
                        ? "En silencio"
                        : "Listo"}
              </div>
              {isPaused ? (
                <p className="text-muted-foreground mt-1">
                  En pausa. La línea actual y el avance se conservan.
                </p>
              ) : isListening ? (
                <>
                  <MicLevelMeter stream={micStream} />
                  <p className="text-muted-foreground mt-1">
                    Te escucho. Tras un momento de silencio comparo la línea.
                  </p>
                </>
              ) : isRehearsing ? (
                <p className="text-muted-foreground mt-1">
                  El micrófono solo se abre en el turno de una persona. La voz del navegador lee los
                  demás papeles.
                </p>
              ) : (
                <p className="text-muted-foreground mt-1">
                  El botón redondo inicia o pausa el ensayo. Finalizar ensayo guarda el avance.
                </p>
              )}
              <div className="font-mono text-foreground mt-0.5">{connectionStatus}</div>
              {transcript && (
                <div className="text-muted-foreground mt-1">
                  Te escuche: "{transcript}"
                  {lastScore !== null ? ` · ${Math.round(lastScore * 100)}%` : ""}
                </div>
              )}
              {lastTakeUrl && (
                <button
                  type="button"
                  onClick={() => {
                    const audio = new Audio(lastTakeUrl);
                    void audio.play();
                  }}
                  className="mt-2 text-xs text-primary hover:underline"
                >
                  Reproducir última toma
                </button>
              )}
            </div>
            <div className="flex items-center gap-2">
              <ControlBtn icon={SkipBack} label="Retroceder línea" onClick={handleSkipBackward} />
              <button
                type="button"
                onClick={handleToggleRecording}
                aria-label={
                  !isRehearsing
                    ? isLecturaMode
                      ? "Iniciar lectura"
                      : "Iniciar ensayo con micrófono"
                    : isPaused
                      ? "Reanudar ensayo"
                      : "Pausar ensayo"
                }
                className="w-14 h-14 rounded-full grid place-items-center shadow-glow ring-4 ring-primary/20 bg-primary-gradient text-primary-foreground transition-all"
              >
                {!isRehearsing ? (
                  isLecturaMode ? (
                    <Play className="w-6 h-6 fill-current" />
                  ) : (
                    <Mic className="w-6 h-6" />
                  )
                ) : isPaused ? (
                  <Play className="w-6 h-6 fill-current" />
                ) : (
                  <Pause className="w-6 h-6 fill-current" />
                )}
              </button>
              <ControlBtn icon={SkipForward} label="Siguiente línea" onClick={handleSkipForward} />
              <ControlBtn icon={RotateCcw} label="Reiniciar" onClick={handleReset} />
              <button
                type="button"
                aria-label="Finalizar ensayo"
                onClick={() => setConfirmFinish(true)}
                className="inline-flex items-center gap-2 bg-destructive text-destructive-foreground rounded-lg px-3 py-2 text-sm hover:opacity-90"
              >
                <Square className="w-3.5 h-3.5 fill-current" /> Finalizar ensayo
              </button>
            </div>
            {!isLecturaMode && (
              <div className="w-full">
                <label className="text-[10px] tracking-[0.2em] text-muted-foreground uppercase">
                  Micrófono o escribe tu línea
                </label>
                <div className="mt-1 flex gap-2">
                  <input
                    value={typedLine}
                    disabled={!isRehearsing || isPaused || !isHumanTurn}
                    onChange={(event) => setTypedLine(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        event.preventDefault();
                        submitTypedLine();
                      }
                    }}
                    placeholder={
                      isRehearsing && isHumanTurn
                        ? "Di la línea o escríbela aquí y pulsa Enter"
                        : isRehearsing
                          ? "Espera el turno de una persona o usa siguiente línea"
                          : "Pulsa el botón redondo para empezar"
                    }
                    className="flex-1 bg-surface border border-input rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-ring focus:ring-2 focus:ring-ring disabled:opacity-50"
                  />
                  <button
                    type="button"
                    disabled={!isRehearsing || isPaused || !isHumanTurn || !typedLine.trim()}
                    onClick={submitTypedLine}
                    className="inline-flex items-center gap-2 border border-primary/40 text-primary rounded-lg px-3 py-2 text-sm disabled:opacity-50"
                  >
                    Enviar
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        <aside className="space-y-4">
          {setup?.scene?.description &&
            !setup.scene.description.startsWith("Escena creada al importar") && (
              <Card title="Anotación de la escena / Dirección">
                <p className="text-xs text-muted-foreground whitespace-pre-line leading-relaxed max-h-48 overflow-y-auto pr-1">
                  {setup.scene.description}
                </p>
              </Card>
            )}

          <Card title="Personajes en escena">
            <div className="space-y-3">
              {(setup?.characters ?? []).slice(0, 4).map((character) => (
                <CharRow
                  key={character.id}
                  icon={character.id === selectedCharacter?.id ? Crown : Drama}
                  name={`${character.name} (${roleLabelFor(character.id, sessionRoles)})`}
                  status={character.id === currentLine?.character_id ? "Activo" : "En espera"}
                  muted={character.id === selectedCharacter?.id}
                  playing={isRehearsing && !isPaused && character.id === currentLine?.character_id}
                />
              ))}
            </div>
          </Card>

          <Card title="Voz y micrófono">
            <Quick
              label="Motor de voz"
              value={speechOk || isLecturaMode ? "Navegador" : "No disponible"}
            />
            <Quick
              label="Turno actual"
              value={
                isLecturaMode
                  ? "Lectura en voz alta"
                  : humanTurnLabel === "Tú"
                    ? "Tu turno"
                    : humanTurnLabel
                      ? `Turno de ${humanTurnLabel}`
                      : "Voz del navegador"
              }
            />
            <Quick
              label="Coincidencia"
              value={lastScore === null ? "—" : `${Math.round(lastScore * 100)}%`}
            />
            <div className="mt-3 rounded-lg border border-border/60 bg-surface p-3">
              <div className="text-[10px] tracking-[0.2em] text-muted-foreground uppercase mb-1">
                Estado
              </div>
              <p className="text-xs leading-relaxed text-foreground min-h-10">
                {isPaused
                  ? "En pausa. La línea actual y el avance se conservan."
                  : isLecturaMode
                    ? "Modo lectura: se reproducen todas las líneas con la voz del navegador."
                    : isSpeaking
                      ? "Se está leyendo la línea del otro personaje. Cuando termine, te toca a ti."
                      : isListening
                        ? "Habla tu línea. El ensayo avanza cuando reconoce las palabras clave, aunque no sea literal."
                        : "Pulsa el micrófono para ensayar: los otros papeles se leen con la voz de tu navegador."}
              </p>
            </div>
          </Card>

          {Object.keys(groupAudioUrls).length > 0 && (
            <Card title="Tomas guardadas">
              <div className="space-y-2">
                {lines
                  .filter((line) => groupAudioUrls[line.id])
                  .map((line) => (
                    <button
                      key={line.id}
                      type="button"
                      onClick={() => {
                        const url = groupAudioUrls[line.id];
                        if (!url) return;
                        const audio = new Audio(url);
                        void audio.play();
                      }}
                      className="w-full text-left text-xs rounded-lg border border-border/50 bg-surface px-3 py-2 hover:border-primary/40"
                    >
                      <span className="text-muted-foreground">
                        {line.character?.name ?? "Actor"}
                      </span>
                      <span className="block truncate text-foreground">{line.text}</span>
                    </button>
                  ))}
              </div>
            </Card>
          )}

          <Card title="Progreso de la escena">
            <div className="flex justify-between text-xs mb-2">
              <span className="text-muted-foreground">Lineas</span>
              <span>
                {completed} / {total}
              </span>
            </div>
            <div className="h-1.5 rounded-full bg-surface overflow-hidden">
              <div
                className="h-full bg-primary-gradient transition-all duration-300"
                style={{ width: `${progress}%` }}
              />
            </div>
          </Card>
        </aside>
      </div>
    </AppShell>
  );
}

function LineCard({
  title,
  line,
  roles,
  active,
  faded,
  speaking,
}: {
  title: string;
  line: ScriptLineWithCharacter | null;
  roles: ReturnType<typeof rolesForSession>;
  active?: boolean;
  faded?: boolean;
  speaking?: boolean;
}) {
  const role = roleLabelFor(line?.character_id, roles);
  const tone = role === "Tú" ? "text-primary" : role === "voz" ? "text-success" : "text-foreground";

  return (
    <div>
      <p className="text-[10px] tracking-[0.25em] text-muted-foreground uppercase mb-2">{title}</p>
      <div
        className={`${active ? "border-2 border-primary bg-accent text-accent-foreground" : "border border-border bg-surface text-foreground"} ${
          faded ? "opacity-70" : ""
        } rounded-xl p-5 relative`}
      >
        {active && (
          <div className="absolute -left-3 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full bg-primary text-primary-foreground grid place-items-center">
            <Play className="w-3 h-3 fill-current" />
          </div>
        )}
        {line ? (
          <>
            <div className="flex items-center gap-2 mb-2">
              <span className={`text-sm font-semibold ${tone}`}>
                {line.character?.name.toUpperCase() ?? "NARRADOR"} ({role})
              </span>
              <Wave active={Boolean(active && speaking)} />
              {!active && (
                <span className="ml-auto text-xs text-muted-foreground">
                  00:{String(line.duration_seconds).padStart(2, "0")}
                </span>
              )}
            </div>
            <p
              className="leading-relaxed"
              style={{
                fontFamily: '"Times New Roman", Times, serif',
                fontSize: "calc(1.125rem + 1pt)",
              }}
            >
              "{line.text}"
            </p>
            {line.cue && <div className="text-xs text-primary/80 text-right mt-2">{line.cue}</div>}
          </>
        ) : (
          <p className="text-sm text-muted-foreground">
            No hay línea registrada para esta posición.
          </p>
        )}
      </div>
    </div>
  );
}

function ControlBtn({
  icon: Icon,
  label,
  onClick,
  disabled,
}: {
  icon: typeof Mic;
  label: string;
  onClick?: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="flex flex-col items-center gap-1 px-3 py-2 rounded-lg border border-input bg-surface hover:border-primary/40 hover:text-primary transition disabled:opacity-50 disabled:hover:border-input disabled:hover:text-inherit cursor-pointer"
    >
      <Icon className="w-4 h-4" />
      <span className="text-[10px] text-muted-foreground">{label}</span>
    </button>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-card border border-border/60 rounded-xl p-4">
      <p className="text-[10px] tracking-[0.25em] text-muted-foreground uppercase mb-3">{title}</p>
      {children}
    </div>
  );
}

function CharRow({
  icon: Icon,
  name,
  status,
  muted,
  playing,
}: {
  icon: typeof Crown;
  name: string;
  status: string;
  muted?: boolean;
  playing?: boolean;
}) {
  return (
    <div className="flex items-center gap-3">
      <div className="w-9 h-9 rounded-lg bg-primary/10 text-primary grid place-items-center">
        <Icon className="w-4 h-4" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-sm">{name}</div>
        <div className="text-[10px] flex items-center gap-1.5 text-muted-foreground">
          {status} <Wave active={playing} />
        </div>
      </div>
      {muted ? (
        <MicOff className="w-4 h-4 text-muted-foreground" />
      ) : (
        <Volume2 className="w-4 h-4 text-primary" />
      )}
    </div>
  );
}

function Quick({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between py-1.5 text-xs border-b border-border/40 last:border-0">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium text-right">{value}</span>
    </div>
  );
}

function difficultyLabel(value: number) {
  if (value < 33) return "Fácil";
  if (value < 66) return "Media";
  return "Alta";
}

function modeLabel(value: string) {
  if (value === "grupo") return "En grupo";
  if (value === "lectura") return "Lectura";
  return "Individual";
}
