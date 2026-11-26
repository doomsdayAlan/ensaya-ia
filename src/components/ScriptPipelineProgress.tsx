import {
  Sparkles,
  Cpu,
  CheckCircle2,
  Layers,
  Users,
  MessageSquare,
  ArrowRight,
  X,
  Loader2,
} from "lucide-react";
import type { PipelineProgress, PipelineResult } from "@/lib/ai/script-pipeline";

interface ScriptPipelineProgressProps {
  progress: PipelineProgress | null;
  result: PipelineResult | null;
  onClose: () => void;
  onGoToRehearsal?: (scriptId: string) => void;
}

export function ScriptPipelineProgress({
  progress,
  result,
  onClose,
  onGoToRehearsal,
}: ScriptPipelineProgressProps) {
  if (!progress && !result) return null;

  const percent = progress ? Math.round((progress.step / progress.totalSteps) * 100) : 100;
  const isDone = Boolean(result);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div className="w-full max-w-lg bg-surface border border-border/80 rounded-2xl shadow-2xl p-6 relative overflow-hidden">
        {/* Glow de fondo */}
        <div className="absolute -top-16 -right-16 w-48 h-48 bg-primary/10 rounded-full blur-3xl pointer-events-none" />

        <div className="flex items-start justify-between gap-4 mb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary/15 border border-primary/30 grid place-items-center text-primary">
              {isDone ? (
                <CheckCircle2 className="w-5 h-5 text-success" />
              ) : (
                <Sparkles className="w-5 h-5 animate-pulse" />
              )}
            </div>
            <div>
              <h3 className="font-semibold text-base text-foreground">
                {isDone ? "¡Libreto segmentado y registrado!" : "Pipeline TinyLLM en proceso"}
              </h3>
              <p className="text-xs text-muted-foreground">
                {isDone
                  ? "Escenas y personajes listos para ensayar"
                  : "Segmentando escenas y detectando personajes"}
              </p>
            </div>
          </div>
          {isDone && (
            <button
              onClick={onClose}
              className="text-muted-foreground hover:text-foreground p-1 rounded-lg transition"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Barra de progreso */}
        <div className="space-y-2 mb-5">
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>{progress?.message || "Procesamiento finalizado"}</span>
            <span className="font-medium text-foreground">{percent}%</span>
          </div>
          <div className="w-full h-2 bg-surface rounded-full overflow-hidden border border-border/40">
            <div
              className="h-full bg-primary-gradient transition-all duration-300 rounded-full"
              style={{ width: `${percent}%` }}
            />
          </div>
        </div>

        {/* Tarjetas de estadísticas finales */}
        {result ? (
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-2.5">
              <div className="bg-surface border border-border/60 rounded-xl p-3 text-center">
                <div className="flex items-center justify-center text-primary gap-1 mb-1">
                  <Layers className="w-4 h-4" />
                  <span className="text-base font-bold text-foreground">
                    {result.stats.scenesCount}
                  </span>
                </div>
                <div className="text-[11px] text-muted-foreground">Escenas detectadas</div>
              </div>

              <div className="bg-surface border border-border/60 rounded-xl p-3 text-center">
                <div className="flex items-center justify-center text-primary gap-1 mb-1">
                  <Users className="w-4 h-4" />
                  <span className="text-base font-bold text-foreground">
                    {result.stats.charactersCount}
                  </span>
                </div>
                <div className="text-[11px] text-muted-foreground">Personajes únicos</div>
              </div>

              <div className="bg-surface border border-border/60 rounded-xl p-3 text-center">
                <div className="flex items-center justify-center text-primary gap-1 mb-1">
                  <MessageSquare className="w-4 h-4" />
                  <span className="text-base font-bold text-foreground">
                    {result.stats.linesCount}
                  </span>
                </div>
                <div className="text-[11px] text-muted-foreground">Líneas de diálogo</div>
              </div>
            </div>

            {/* Hardware y Formato badge */}
            <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] bg-background/60 border border-border/40 rounded-lg px-3 py-2 text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <Cpu className="w-3.5 h-3.5 text-primary" />
                Motor: {result.stats.hardware.device_name}
              </span>
              <div className="flex items-center gap-1.5">
                <span className="px-1.5 py-0.5 rounded bg-primary/10 text-primary font-medium text-[10px]">
                  {result.stats.formatDetected === "teatro_hispano"
                    ? "Teatro Hispano (Prefijo)"
                    : result.stats.formatDetected === "cine_estandar"
                      ? "Cine Estándar (Sangría)"
                      : "Formato Mixto"}
                </span>
                <span className="px-1.5 py-0.5 rounded bg-accent/30 text-accent-foreground font-medium text-[10px]">
                  {result.stats.source === "gemini"
                    ? "Gemini"
                    : result.stats.source === "ollama"
                      ? "Ollama"
                      : result.stats.source === "fastapi"
                        ? "Modelo local (FastAPI)"
                        : "Heurística del navegador"}
                </span>
              </div>
            </div>

            {/* Muestra de personajes */}
            <div className="bg-surface/40 border border-border/40 rounded-xl p-3 text-xs">
              <span className="text-muted-foreground font-medium block mb-1.5">
                Personajes detectados:
              </span>
              <div className="flex flex-wrap gap-1.5">
                {result.setup.characters.slice(0, 10).map((c, idx) => (
                  <span
                    key={c.id}
                    className={`px-2 py-0.5 rounded-md text-[11px] font-medium border ${
                      idx === 0
                        ? "bg-primary/15 text-primary border-primary/30"
                        : "bg-background border-border/60 text-muted-foreground"
                    }`}
                  >
                    {c.name} {idx === 0 ? "(Tú)" : ""}
                  </span>
                ))}
                {result.setup.characters.length > 10 && (
                  <span className="text-[11px] text-muted-foreground self-center">
                    +{result.setup.characters.length - 10} más...
                  </span>
                )}
              </div>
            </div>

            {/* Botones de acción */}
            <div className="flex items-center justify-end gap-2.5 pt-2">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-xs font-medium border border-border rounded-lg hover:bg-surface text-muted-foreground hover:text-foreground transition"
              >
                Ver en libretos
              </button>
              {onGoToRehearsal && result.setup.script && (
                <button
                  type="button"
                  onClick={() => onGoToRehearsal(result.setup.script!.id)}
                  className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium bg-primary-gradient text-primary-foreground rounded-lg shadow-sm hover:opacity-90 transition"
                >
                  Configurar ensayo
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-center py-6 gap-3 text-sm text-muted-foreground">
            <Loader2 className="w-5 h-5 text-primary animate-spin" />
            <span>Procesando libreto con TinyLLM, un momento...</span>
          </div>
        )}
      </div>
    </div>
  );
}
