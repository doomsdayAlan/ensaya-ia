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
} from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { TopBar } from "@/components/TopBar";
import {
  getPerfilUsuario,
  updateRehearsalSession,
  type ScriptLineWithCharacter,
} from "@/lib/rehearsal-data";
import { requestRehearsalFeedback } from "@/lib/ai/request-rehearsal-feedback";
import {
  buildFeedback,
  canUseSpeechRecognition,
  canUseSpeechSynthesis,
  effectiveMatchDifficulty,
  evaluateSpokenLine,
  listenForLine,
  matchThreshold,
  scoreRehearsal,
  speakLine,
  stopSpeaking,
} from "@/lib/rehearsal-ai";
import {
  loadActiveRehearsal,
  loadRecentRehearsalsSafe,
  loadScriptSetupSafe,
  saveLocalReport,
  type ActiveRehearsal,
} from "@/lib/rehearsal-runtime";
import { getDemoScriptSetup } from "@/lib/demo-script";
import { getGrabacionesGrupo, getGrupoParaScript, saveGrabacionGrupo } from "@/lib/grupos-api";

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

function Ensayo() {
  const nav = useNavigate();
  const listenRef = useRef<{ stop: () => void } | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const lastTakeBlobRef = useRef<Blob | null>(null);
  const takeStartedAtRef = useRef<number>(0);
  const [lastTakeUrl, setLastTakeUrl] = useState<string | null>(null);
  const [groupAudioUrls, setGroupAudioUrls] = useState<Record<string, string>>({});
  const advancingRef = useRef(false);
  const scoresRef = useRef<number[]>([]);
  const skippedRef = useRef(0);
  const repeatedRef = useRef(0);
  const failedLineIdRef = useRef<string | null>(null);

  const [activeConfig, setActiveConfig] = useState<ActiveRehearsal | null>(null);
  const [sessionReady, setSessionReady] = useState(false);
  useEffect(() => {
    setActiveConfig(loadActiveRehearsal());
    setSessionReady(true);
  }, []);
  const [connectionStatus, setConnectionStatus] = useState("Pulsa el microfono para comenzar el ensayo con IA.");
  const [isRehearsing, setIsRehearsing] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [activeLineIndex, setActiveLineIndex] = useState(0);
  const [transcript, setTranscript] = useState("");
  const [typedLine, setTypedLine] = useState("");
  const [lastScore, setLastScore] = useState<number | null>(null);

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
  const lines = useMemo(() => setup?.lines ?? [], [setup?.lines]);
  const currentLine = lines[activeLineIndex] ?? null;
  const nextLine = lines[activeLineIndex + 1] ?? null;
  const afterLine = lines[activeLineIndex + 2] ?? null;
  const selectedCharacterId =
    activeConfig?.selectedCharacterId ??
    latest?.selected_character_id ??
    setup?.characters.find((item) => item.actor_type === "user")?.id ??
    null;
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
  const total = lines.length || latest?.total_lines || 1;
  const completed = Math.min(total, Math.max(activeLineIndex, scoresRef.current.length));
  const progress = Math.min(100, Math.round((completed / total) * 100));
  const isMyTurn = Boolean(currentLine && currentLine.character_id === selectedCharacterId);
  const speechOk = canUseSpeechRecognition() && canUseSpeechSynthesis();
  const userLinesTotal = useMemo(
    () => lines.filter((line) => line.character_id === selectedCharacterId).length,
    [lines, selectedCharacterId],
  );

  const stopTake = () => {
    const recorder = recorderRef.current;
    if (recorder && recorder.state !== "inactive") recorder.stop();
    recorderRef.current = null;
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
    } catch {
      // El reconocimiento de voz sigue funcionando aunque no se grabe el WebM.
    }
  };

  const playAudioUrl = (url: string) =>
    new Promise<void>((resolve) => {
      const audio = new Audio(url);
      let done = false;
      const finish = () => {
        if (done) return;
        done = true;
        resolve();
      };
      audio.onended = finish;
      audio.onerror = finish;
      void audio.play().catch(finish);
    });

  useEffect(() => {
    const sid = activeConfig?.scriptId ?? latest?.script_id;
    if (!isGrupoMode || !sid) {
      setGroupAudioUrls({});
      return;
    }
    let cancelled = false;
    const created: string[] = [];
    void getGrabacionesGrupo(sid, grupoId)
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

  const persistGrupoTake = async (line: ScriptLineWithCharacter, blob: Blob | null) => {
    if (!isGrupoMode || !blob?.size || !line.id) return;
    const sid = activeConfig?.scriptId ?? setup?.script?.id ?? latest?.script_id;
    if (!sid) return;
    let resolvedGrupoId = grupoId;
    if (!resolvedGrupoId) {
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
          ? Math.max(0.1, (Date.now() - takeStartedAtRef.current) / 1000)
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
    listenRef.current?.stop();
    listenRef.current = null;
    setIsListening(false);
    stopTake();
  };

  const finishRehearsal = async (reason: "done" | "manual") => {
    stopListen();
    stopSpeaking();
    setIsRehearsing(false);
    setIsSpeaking(false);

    const skipped = skippedRef.current;
    const repeated = repeatedRef.current;
    const completedLines = Math.min(lines.length, activeLineIndex + (reason === "done" ? 1 : 0));
    const userLinesCompleted = scoresRef.current.length;
    const { memorization, clarity, expression, rhythm, projection, score } = scoreRehearsal({
      userLineScores: scoresRef.current,
      skipped,
      repeated,
      userLinesCompleted,
      userLinesTotal: userLinesTotal || Math.max(1, userLinesCompleted),
    });
    const endedAt = new Date().toISOString();
    const fallbackFeedback = buildFeedback({
      memorization,
      completed: completedLines,
      total: lines.length,
      skipped,
    });
    let feedback = fallbackFeedback;
    let feedbackSource = "template";
    const wantsAiNotes = activeConfig?.feedbackEnabled !== false;
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
          },
        });
        if (notes?.text) {
          feedback = notes.text;
          feedbackSource = notes.source;
        }
      } catch {
        feedback = fallbackFeedback;
        feedbackSource = "template";
      }
    }

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
        teleprompter_last_event: reason === "done" ? "Escena completada con IA local." : "Ensayo finalizado.",
      }).catch(() => null);
    }

    nav({ to: "/finalizado" });
  };

  const advance = (opts?: { skipped?: boolean; score?: number }) => {
    if (advancingRef.current) return;
    advancingRef.current = true;
    stopListen();
    stopSpeaking();
    setIsSpeaking(false);
    setTranscript("");
    failedLineIdRef.current = null;

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

    window.setTimeout(() => {
      advancingRef.current = false;
    }, 250);
  };

  const applySpokenText = (text: string, fromTyping = false) => {
    if (!currentLine) return false;
    const verdict = evaluateSpokenLine(text, currentLine.text, matchDifficulty);
    setTranscript(text);
    setLastScore(verdict.score);
    if (verdict.accepted) {
      setConnectionStatus(`Linea reconocida (${verdict.percent}%).`);
      toast.success("La IA reconocio tu linea");
      setTypedLine("");
      const line = currentLine;
      void (async () => {
        const blob = await stopTakeAndGetBlob();
        await persistGrupoTake(line, blob);
        advance({ score: verdict.score });
      })();
      return true;
    }
    if (failedLineIdRef.current === currentLine.id) {
      repeatedRef.current += 1;
    } else {
      failedLineIdRef.current = currentLine.id;
    }
    if (verdict.close || fromTyping) {
      setConnectionStatus(`Casi... ${verdict.percent}%. Sigue hablando o escribe las palabras clave.`);
    }
    return false;
  };

  useEffect(() => {
    if (!isRehearsing || !currentLine || advancingRef.current) return;

    // Modo lectura: TTS de todas las lineas, sin exigir microfono para avanzar.
    if (isLecturaMode) {
      const character = currentLine.character;
      const emotionHint =
        suggestEmotions && character?.base_emotion
          ? ` · emocion: ${character.base_emotion}`
          : "";
      setConnectionStatus(
        isMyTurn
          ? `Lectura: tu linea (${character?.name ?? "Tu"})${emotionHint}`
          : `Lectura: ${character?.name ?? "IA"}${emotionHint}`,
      );
      setIsSpeaking(true);
      setIsListening(false);
      stopListen();

      let cancelled = false;
      const voice = character?.voice || preferredVoice;
      void speakLine(currentLine.text, voice)
        .then(() => {
          if (cancelled) return;
          setIsSpeaking(false);
          // En lectura no sumamos score de IA; solo lineas de usuario cuentan como 1 (lectura completa).
          if (isMyTurn) advance({ score: 1 });
          else advance();
        })
        .catch((error) => {
          if (cancelled) return;
          setIsSpeaking(false);
          setConnectionStatus(error instanceof Error ? error.message : "No se pudo leer la linea.");
        });

      return () => {
        cancelled = true;
        stopSpeaking();
      };
    }

    if (isMyTurn) {
      setIsSpeaking(false);
      stopSpeaking();
      if (!canUseSpeechRecognition()) {
        setConnectionStatus("Este navegador no reconoce voz. Usa Chrome o Edge, o avanza la linea a mano.");
        return;
      }
      setConnectionStatus("Tu turno. Di la linea en voz alta.");
      stopListen();
      void startTake();
      const handle = listenForLine({
        onTranscript: (text) => {
          applySpokenText(text);
        },
        onError: (message) => {
          setConnectionStatus(message);
          toast.error(message);
        },
      });
      listenRef.current = handle;
      setIsListening(Boolean(handle));
      return () => {
        handle?.stop();
      };
    }

    const character = currentLine.character;
    const savedUrl = isGrupoMode ? groupAudioUrls[currentLine.id] : undefined;
    const emotionHint =
      suggestEmotions && character?.base_emotion ? ` · emocion: ${character.base_emotion}` : "";
    setConnectionStatus(
      savedUrl
        ? `${character?.name ?? "Actor"} (grabacion del grupo)${emotionHint}...`
        : `${character?.name ?? "IA"} esta interpretando su linea${emotionHint}...`,
    );
    setIsSpeaking(true);
    setIsListening(false);
    stopListen();

    let cancelled = false;
    const voice = character?.voice || preferredVoice;
    const playback = savedUrl ? playAudioUrl(savedUrl) : speakLine(currentLine.text, voice);

    void playback
      .then(() => {
        if (cancelled) return;
        setIsSpeaking(false);
        // Lineas de IA / otros personajes: avanzar sin empujar score 1.
        advance();
      })
      .catch((error) => {
        if (cancelled) return;
        setIsSpeaking(false);
        setConnectionStatus(error instanceof Error ? error.message : "No se pudo hablar la linea de IA.");
      });

    return () => {
      cancelled = true;
      stopSpeaking();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isRehearsing, activeLineIndex, currentLine?.id, isMyTurn, isLecturaMode, preferredVoice, suggestEmotions]);

  useEffect(() => {
    return () => {
      stopListen();
      stopSpeaking();
    };
  }, []);

  const handleToggleRecording = () => {
    if (isLecturaMode) {
      if (isRehearsing) {
        void finishRehearsal("manual");
        return;
      }
      if (typeof window !== "undefined") {
        window.speechSynthesis.getVoices();
      }
      setIsRehearsing(true);
      setConnectionStatus("Lectura iniciada. Se leen todas las lineas en voz alta.");
      toast.success("Modo lectura: sin microfono para avanzar.");
      return;
    }

    if (!speechOk) {
      toast.error("Usa Chrome o Edge en http://localhost para voz y microfono.");
    }

    if (isRehearsing && isMyTurn) {
      const verdict = evaluateSpokenLine(transcript, currentLine?.text ?? "", matchDifficulty);
      if (verdict.score >= matchThreshold(matchDifficulty) * 0.75) {
        advance({ score: verdict.score });
        return;
      }
      advance({ skipped: true, score: verdict.score });
      return;
    }

    if (isRehearsing) {
      void finishRehearsal("manual");
      return;
    }

    if (typeof window !== "undefined") {
      window.speechSynthesis.getVoices();
    }
    setIsRehearsing(true);
    setConnectionStatus("Ensayo con IA iniciado.");
    toast.success("Ensayo iniciado. La IA interpretara los otros personajes.");
  };

  const handleSkipForward = () => {
    if (activeLineIndex >= lines.length - 1) {
      void finishRehearsal("done");
      return;
    }
    advance({ skipped: isMyTurn && !isLecturaMode });
  };

  const handleSkipBackward = () => {
    stopListen();
    stopSpeaking();
    setIsSpeaking(false);
    setTranscript("");
    repeatedRef.current += 1;
    failedLineIdRef.current = null;
    setActiveLineIndex((prev) => Math.max(0, prev - 1));
  };

  const handleReset = () => {
    stopListen();
    stopSpeaking();
    scoresRef.current = [];
    skippedRef.current = 0;
    repeatedRef.current = 0;
    failedLineIdRef.current = null;
    setActiveLineIndex(0);
    setTranscript("");
    setTypedLine("");
    setLastScore(null);
    setIsRehearsing(false);
    setIsSpeaking(false);
    setConnectionStatus("Escena reiniciada. Pulsa el microfono para volver a empezar.");
  };

  const submitTypedLine = () => {
    if (!isRehearsing || !isMyTurn || !currentLine || isLecturaMode) return;
    const text = typedLine.trim();
    if (!text) return;
    applySpokenText(text, true);
  };

  return (
    <AppShell>
      <TopBar back={{ to: "/", label: "Modo ensayo" }} />

      {loading && (
        <div className="bg-card border border-border/60 rounded-xl p-4 mb-5 text-sm text-muted-foreground">
          Cargando escena...
        </div>
      )}

      {!speechOk && !isLecturaMode && (
        <div className="bg-card border border-primary/40 rounded-xl p-4 mb-5 text-sm text-muted-foreground">
          Para que la IA te escuche y hable, abre la app en Chrome o Edge. Puedes avanzar lineas a mano si el
          reconocimiento no esta disponible.
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
            <div className="text-[10px] tracking-[0.2em] text-muted-foreground uppercase">Interpretas</div>
            <div className="text-sm">
              {selectedCharacter ? `${selectedCharacter.name} (Tu)` : "Sin personaje"}
            </div>
          </div>
        </div>
        <div className="text-xs leading-relaxed">
          <div className="text-[10px] tracking-[0.2em] text-muted-foreground uppercase mb-0.5">Modo</div>
          <div>
            Realismo: <span className="text-primary">{difficultyLabel(difficulty)}</span>
          </div>
          <div>
            Ritmo: <span className="text-primary">{modeLabel(mode)}</span>
          </div>
        </div>
        <button
          type="button"
          onClick={() => void finishRehearsal("manual")}
          className="ml-auto inline-flex items-center gap-2 border border-destructive/50 text-destructive rounded-lg px-3 py-2 text-sm hover:bg-destructive/10"
        >
          <Square className="w-3.5 h-3.5 fill-current" /> Finalizar ensayo
        </button>
      </div>

      <div className="grid lg:grid-cols-[1fr_300px] gap-5">
        <div className="space-y-4">
          <LineCard
            title="Linea actual"
            line={currentLine}
            selectedCharacterId={selectedCharacterId}
            active
            speaking={isSpeaking && !isMyTurn}
          />
          <LineCard title="Siguiente linea" line={nextLine} selectedCharacterId={selectedCharacterId} />
          <LineCard title="Despues" line={afterLine} selectedCharacterId={selectedCharacterId} faded />

          <div className="bg-card border border-border/60 rounded-xl p-4 mt-6 flex flex-wrap items-center justify-between gap-4">
            <div className="text-xs">
              <div className="flex items-center gap-1.5 text-success">
                <span
                  className={`w-1.5 h-1.5 rounded-full ${isListening || isSpeaking ? "bg-destructive animate-pulse" : "bg-success"}`}
                />{" "}
                {isSpeaking ? "IA hablando" : isListening ? "Escuchando" : isRehearsing ? "En ensayo" : "Listo"}
              </div>
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
                  Reproducir ultima toma
                </button>
              )}
            </div>
            <div className="flex items-center gap-2">
              <ControlBtn icon={SkipBack} label="Retroceder linea" onClick={handleSkipBackward} />
              <button
                onClick={handleToggleRecording}
                aria-label={
                  isLecturaMode
                    ? isRehearsing
                      ? "Detener lectura"
                      : "Iniciar lectura"
                    : isRehearsing
                      ? "Detener ensayo"
                      : "Iniciar ensayo con microfono"
                }
                className={`w-14 h-14 rounded-full grid place-items-center shadow-glow ring-4 transition-all ${
                  isRehearsing
                    ? "bg-destructive text-destructive-foreground ring-destructive/20"
                    : "bg-primary-gradient text-primary-foreground ring-primary/20"
                }`}
              >
                {isRehearsing ? (
                  <Square className="w-5 h-5 fill-current" />
                ) : isLecturaMode ? (
                  <Play className="w-6 h-6 fill-current" />
                ) : (
                  <Mic className="w-6 h-6" />
                )}
              </button>
              <ControlBtn icon={SkipForward} label="Siguiente linea" onClick={handleSkipForward} />
              <ControlBtn icon={RotateCcw} label="Reiniciar" onClick={handleReset} />
            </div>
            {!isLecturaMode && (
              <div className="w-full">
                <label className="text-[10px] tracking-[0.2em] text-muted-foreground uppercase">
                  Microfono o escribe tu linea
                </label>
                <div className="mt-1 flex gap-2">
                  <input
                    value={typedLine}
                    disabled={!isRehearsing || !isMyTurn}
                    onChange={(event) => setTypedLine(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        event.preventDefault();
                        submitTypedLine();
                      }
                    }}
                    placeholder={
                      isRehearsing && isMyTurn
                        ? "Di la linea o escribela aqui y pulsa Enter"
                        : isRehearsing
                          ? "Espera a tu turno o usa siguiente linea"
                          : "Pulsa el microfono para empezar"
                    }
                    className="flex-1 bg-surface border border-border/60 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-primary/50 disabled:opacity-50"
                  />
                  <button
                    type="button"
                    disabled={!isRehearsing || !isMyTurn || !typedLine.trim()}
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
          <Card title="Personajes en escena">
            <div className="space-y-3">
              {(setup?.characters ?? []).slice(0, 4).map((character) => (
                <CharRow
                  key={character.id}
                  icon={character.id === selectedCharacter?.id ? Crown : Drama}
                  name={`${character.name}${character.id === selectedCharacter?.id ? " (Tu)" : " (IA)"}`}
                  status={character.id === currentLine?.character_id ? "Activo" : "En espera"}
                  muted={character.id === selectedCharacter?.id}
                  playing={isRehearsing && character.id === currentLine?.character_id}
                />
              ))}
            </div>
          </Card>

          <Card title="IA en vivo">
            <Quick label="Motor de voz" value={speechOk || isLecturaMode ? "Navegador" : "No disponible"} />
            <Quick label="Turno actual" value={isLecturaMode ? "Lectura TTS" : isMyTurn ? "Tu turno" : "IA habla"} />
            <Quick
              label="Coincidencia"
              value={lastScore === null ? "—" : `${Math.round(lastScore * 100)}%`}
            />
            <div className="mt-3 rounded-lg border border-border/60 bg-surface p-3">
              <div className="text-[10px] tracking-[0.2em] text-muted-foreground uppercase mb-1">Estado</div>
              <p className="text-xs leading-relaxed text-foreground min-h-10">
                {isLecturaMode
                  ? "Modo lectura: se reproducen todas las lineas con la voz del navegador."
                  : isSpeaking
                    ? "La IA esta diciendo su linea. Cuando termine, te toca a ti."
                    : isListening
                      ? "Habla tu linea. La IA avanza cuando reconoce las palabras clave, aunque no sea literal."
                      : "Pulsa el microfono para que la IA interprete los otros papeles contigo."}
              </p>
            </div>
          </Card>

          <Card title="Progreso de la escena">
            <div className="flex justify-between text-xs mb-2">
              <span className="text-muted-foreground">Lineas</span>
              <span>
                {completed} / {total}
              </span>
            </div>
            <div className="h-1.5 rounded-full bg-surface overflow-hidden">
              <div className="h-full bg-primary-gradient transition-all duration-300" style={{ width: `${progress}%` }} />
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
  selectedCharacterId,
  active,
  faded,
  speaking,
}: {
  title: string;
  line: ScriptLineWithCharacter | null;
  selectedCharacterId: string | null;
  active?: boolean;
  faded?: boolean;
  speaking?: boolean;
}) {
  const isUserLine = line?.character_id === selectedCharacterId;
  const tone = isUserLine ? "text-primary" : "text-success";

  return (
    <div>
      <p className="text-[10px] tracking-[0.25em] text-muted-foreground uppercase mb-2">{title}</p>
      <div
        className={`${active ? "border-2 border-primary/60 bg-primary/5 shadow-glow" : "border border-border/60 bg-card"} ${
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
                {line.character?.name.toUpperCase() ?? "NARRADOR"} {isUserLine ? "(Tu)" : "(IA)"}
              </span>
              <Wave active={Boolean(active && speaking)} />
              {!active && (
                <span className="ml-auto text-xs text-muted-foreground">
                  00:{String(line.duration_seconds).padStart(2, "0")}
                </span>
              )}
            </div>
            <p className="text-lg leading-relaxed font-display italic">"{line.text}"</p>
            {line.cue && <div className="text-xs text-primary/80 text-right mt-2">{line.cue}</div>}
          </>
        ) : (
          <p className="text-sm text-muted-foreground">No hay linea registrada para esta posicion.</p>
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
      className="flex flex-col items-center gap-1 px-3 py-2 rounded-lg border border-border/60 bg-surface hover:border-primary/40 hover:text-primary transition disabled:opacity-50 disabled:hover:border-border/60 disabled:hover:text-inherit cursor-pointer"
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
      {muted ? <MicOff className="w-4 h-4 text-muted-foreground" /> : <Volume2 className="w-4 h-4 text-primary" />}
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
  if (value < 33) return "Facil";
  if (value < 66) return "Media";
  return "Alta";
}

function modeLabel(value: string) {
  if (value === "grupo") return "En grupo";
  if (value === "lectura") return "Lectura";
  return "Individual";
}
