import { type ChangeEvent, type MouseEvent, useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import {
  Search,
  Star,
  MoreVertical,
  LayoutGrid,
  List,
  Edit,
  Users,
  Copy,
  Trash2,
  ChevronRight,
  Drama,
  Crown,
  Feather,
  BookOpen,
  Theater,
  Upload,
  Save,
  X,
  RotateCcw,
  CheckCircle2,
  Plus,
} from "lucide-react";
import { AppShell } from "@/components/AppShell";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { TopBar } from "@/components/TopBar";
import { ScriptPipelineProgress } from "@/components/ScriptPipelineProgress";
import { readScriptFile } from "@/lib/pdf-script";
import { requestScriptSegment } from "@/lib/ai/request-script-segment";
import {
  executeScriptPipeline,
  pipelineResultFromSetup,
  type PipelineProgress,
  type PipelineResult,
} from "@/lib/ai/script-pipeline";
import {
  buildScriptSetupFromSegment,
  deleteScriptPermanently,
  duplicateScript,
  formatActCount,
  formatRelativeDate,
  getCurrentUserId,
  getScriptDetails,
  getScripts,
  importScriptFromText,
  restoreScript,
  saveLocalScriptSetup,
  setActiveScript,
  softDeleteScript,
  toggleScriptFavorite,
  updateScript,
  updateScriptDialogue,
  createBlankScript,
  type ScriptImportDraft,
  type ScriptRecord,
  type ScriptSetup,
} from "@/lib/rehearsal-data";
import { consolidateScriptLines } from "@/lib/consolidate-script-lines";
import { dialogueFromSetup } from "@/lib/local-library";

const IMPORT_TIMEOUT_MS = 8000;

function formatDialogueFromSetup(setup: ScriptSetup): string {
  const byScene = new Map<string, typeof setup.lines>();
  for (const line of setup.lines) {
    const list = byScene.get(line.scene_id) ?? [];
    list.push(line);
    byScene.set(line.scene_id, list);
  }
  const blocks: string[] = [];
  for (const scene of setup.scenes) {
    blocks.push(scene.title);
    const lines = byScene.get(scene.id) ?? [];
    for (const line of lines) {
      if (line.cue) blocks.push(`(${line.cue})`);
      const name = line.character?.name?.trim();
      blocks.push(name ? `${name}: ${line.text}` : line.text);
    }
    blocks.push("");
  }
  return blocks.join("\n").trim();
}

function applyCharacterRenames(setup: ScriptSetup, names: string[]): ScriptSetup {
  const characters = setup.characters.map((character, index) => {
    const nextName = names[index]?.trim();
    return nextName && nextName !== character.name ? { ...character, name: nextName } : character;
  });
  const byId = new Map(characters.map((character) => [character.id, character]));
  const lines = setup.lines.map((line) => ({
    ...line,
    character: line.character_id ? (byId.get(line.character_id) ?? line.character) : null,
  }));
  return { ...setup, characters, lines };
}

function sourceLabel(result: PipelineResult): string {
  if (result.stats.source === "gemini") return "Gemini";
  if (result.stats.source === "ollama") return "Ollama";
  if (result.stats.source === "fastapi") return "modelo local (FastAPI)";
  return "heurística del navegador";
}

function withTimeout<T>(promise: Promise<T>, ms: number, code: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) => {
      window.setTimeout(() => reject(new Error(code)), ms);
    }),
  ]);
}

export const Route = createFileRoute("/libretos")({
  component: Libretos,
});

const TABS = ["Todos", "Mis libretos", "Favoritos", "Papelera"] as const;
type Tab = (typeof TABS)[number];
type SortMode = "recent" | "title" | "author";

function getScriptIcon(script: Pick<ScriptRecord, "title" | "genre"> | null) {
  const text = `${script?.title ?? ""} ${script?.genre ?? ""}`.toLowerCase();
  if (text.includes("hamlet")) return Crown;
  if (text.includes("bernarda")) return Theater;
  if (text.includes("godot")) return BookOpen;
  if (text.includes("ernesto")) return Feather;
  return Drama;
}

function Libretos() {
  const queryClient = useQueryClient();
  const nav = useNavigate();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const keepEditingRef = useRef(false);
  const [query, setQuery] = useState("");
  const [activeTab, setActiveTab] = useState<Tab>("Todos");
  const [sortMode, setSortMode] = useState<SortMode>("recent");
  const [viewMode, setViewMode] = useState<"list" | "grid">("list");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [showCharacters, setShowCharacters] = useState(false);
  const [editForm, setEditForm] = useState({
    title: "",
    author: "",
    genre: "",
    act_count: 1,
    description: "",
    dialogue: "",
  });
  const [pipelineProgress, setPipelineProgress] = useState<PipelineProgress | null>(null);
  const [pipelineBusy, setPipelineBusy] = useState(false);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [reviewResult, setReviewResult] = useState<PipelineResult | null>(null);
  const [reviewNames, setReviewNames] = useState<string[]>([]);
  const [reviewDialogue, setReviewDialogue] = useState("");
  const [reviewTitle, setReviewTitle] = useState("");
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasteTitle, setPasteTitle] = useState("");
  const [pasteText, setPasteText] = useState("");
  const [confirmingImport, setConfirmingImport] = useState(false);

  const { data: currentUserId } = useQuery({
    queryKey: ["current-user-id"],
    queryFn: getCurrentUserId,
  });

  const {
    data: scripts = [],
    isError,
    isLoading,
  } = useQuery({
    queryKey: ["scripts", "with-trash"],
    queryFn: () => getScripts({ includeDeleted: true }),
  });

  const filteredScripts = useMemo(() => {
    const value = query.trim().toLowerCase();

    return scripts
      .filter((script) => {
        const deleted = Boolean(script.deleted_at);

        if (activeTab === "Papelera") return deleted;
        if (deleted) return false;
        if (activeTab === "Mis libretos")
          return Boolean(currentUserId && script.user_id === currentUserId);
        if (activeTab === "Favoritos")
          return Boolean(
            script.is_favorite &&
            (script.user_id === currentUserId || script.is_public || script.source_type === "seed"),
          );
        // "Todos": solo del usuario en sesion + demos/publicos explicitos.
        return Boolean(
          (currentUserId && script.user_id === currentUserId) ||
          script.is_public ||
          script.source_type === "seed",
        );
      })
      .filter((script) => {
        if (!value) return true;

        return [script.title, script.author, script.genre, script.description]
          .filter(Boolean)
          .some((field) => field!.toLowerCase().includes(value));
      })
      .sort((a, b) => {
        if (sortMode === "title") return a.title.localeCompare(b.title);
        if (sortMode === "author") return (a.author ?? "").localeCompare(b.author ?? "");
        return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime();
      });
  }, [activeTab, currentUserId, query, scripts, sortMode]);

  const selectedScript =
    filteredScripts.find((script) => script.id === selectedId) ??
    filteredScripts.find((script) => script.is_active) ??
    filteredScripts[0] ??
    null;

  const { data: details } = useQuery({
    queryKey: ["script-details", selectedScript?.id],
    queryFn: () => getScriptDetails(selectedScript!.id),
    enabled: Boolean(selectedScript),
  });

  const canEdit = Boolean(
    selectedScript && currentUserId && selectedScript.user_id === currentUserId,
  );
  const isTrash = Boolean(selectedScript?.deleted_at);
  const DetailIcon = getScriptIcon(selectedScript);

  useEffect(() => {
    if (!pasteOpen && !reviewOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setPasteOpen(false);
      setReviewOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [pasteOpen, reviewOpen]);

  useEffect(() => {
    if (!selectedScript) return;
    setEditForm({
      title: selectedScript.title,
      author: selectedScript.author ?? "",
      genre: selectedScript.genre ?? "",
      act_count: selectedScript.act_count,
      description: selectedScript.description ?? "",
      dialogue: dialogueFromSetup(selectedScript.id),
    });
    if (keepEditingRef.current) {
      keepEditingRef.current = false;
      setEditing(true);
    } else {
      setEditing(false);
    }
    setShowCharacters(false);
  }, [selectedScript]);

  const refreshScripts = () => {
    queryClient.invalidateQueries({ queryKey: ["scripts"] });
    queryClient.invalidateQueries({ queryKey: ["script-details"] });
    queryClient.invalidateQueries({ queryKey: ["script-setup-v2"] });
  };

  const importMutation = useMutation({
    mutationFn: importScriptFromText,
    onSuccess: (script) => {
      refreshScripts();
      setSelectedId(script.id);
      setActiveTab("Mis libretos");
      toast.success(
        script.description?.includes("detectados")
          ? `Libreto importado. ${script.description}`
          : "Libreto importado en este dispositivo",
      );
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : "No se pudo importar el libreto"),
  });

  const createMutation = useMutation({
    mutationFn: () => createBlankScript("Nuevo libreto"),
    onSuccess: (script) => {
      keepEditingRef.current = true;
      queryClient.setQueryData(["scripts", "with-trash"], (current: ScriptRecord[] | undefined) => {
        if (!current) return [script];
        return [script, ...current.filter((item) => item.id !== script.id)];
      });
      refreshScripts();
      setSelectedId(script.id);
      setActiveTab("Mis libretos");
      setEditing(true);
      toast.success("Libreto creado. Edita el título y las líneas.");
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : "No se pudo crear el libreto"),
  });

  const updateMutation = useMutation({
    mutationFn: async () => {
      if (!selectedScript) throw new Error("Selecciona un libreto.");
      const updated = await updateScript(selectedScript.id, {
        title: editForm.title.trim(),
        author: editForm.author.trim() || null,
        genre: editForm.genre.trim() || null,
        act_count: Math.max(1, editForm.act_count),
        description: editForm.description.trim() || null,
      });
      if (editForm.dialogue.trim()) {
        await updateScriptDialogue(selectedScript.id, editForm.dialogue);
      }
      return updated;
    },
    onSuccess: () => {
      refreshScripts();
      setEditing(false);
      toast.success("Libreto actualizado");
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : "No se pudo actualizar el libreto"),
  });

  const favoriteMutation = useMutation({
    mutationFn: toggleScriptFavorite,
    onSuccess: refreshScripts,
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : "No se pudo actualizar favorito"),
  });

  const activeMutation = useMutation({
    mutationFn: setActiveScript,
    onSuccess: () => {
      refreshScripts();
      toast.success("Libreto activo para ensayos");
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : "No se pudo activar el libreto"),
  });

  const duplicateMutation = useMutation({
    mutationFn: duplicateScript,
    onSuccess: (script) => {
      refreshScripts();
      setSelectedId(script.id);
      setActiveTab("Mis libretos");
      toast.success("Copia creada en este dispositivo");
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : "No se pudo duplicar el libreto"),
  });

  const deleteMutation = useMutation({
    mutationFn: softDeleteScript,
    onSuccess: () => {
      refreshScripts();
      setActiveTab("Papelera");
      toast.success("Libreto movido a papelera");
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : "No se pudo eliminar el libreto"),
  });

  const restoreMutation = useMutation({
    mutationFn: restoreScript,
    onSuccess: () => {
      refreshScripts();
      setActiveTab("Mis libretos");
      toast.success("Libreto restaurado");
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : "No se pudo restaurar el libreto"),
  });

  const hardDeleteMutation = useMutation({
    mutationFn: deleteScriptPermanently,
    onSuccess: () => {
      refreshScripts();
      setSelectedId(null);
      toast.success("Libreto eliminado definitivamente");
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : "No se pudo eliminar definitivamente"),
  });

  function openReview(result: PipelineResult) {
    setReviewResult(result);
    setReviewTitle(result.setup.script?.title || "Libreto importado");
    setReviewNames(result.setup.characters.map((character) => character.name));
    setReviewDialogue(formatDialogueFromSetup(result.setup));
    setPipelineBusy(false);
    setPipelineProgress({
      step: 5,
      totalSteps: 5,
      message: `Listo con ${sourceLabel(result)}. Revisa antes de guardar.`,
      stage: "done",
    });
    window.setTimeout(() => {
      setPipelineProgress(null);
      setReviewOpen(true);
    }, 400);
  }

  function fallbackLocalImport(draft: ScriptImportDraft, reason: string) {
    toast.message(reason);
    // Sin Gemini: el diálogo ya se intentó segmentar arriba.
    importMutation.mutate(draft);
  }

  async function runLocalPipelineFallback(draft: ScriptImportDraft) {
    if (!currentUserId) return;

    setPipelineBusy(true);
    setPipelineProgress({
      step: 1,
      totalSteps: 5,
      message: "Gemini no disponible; usando detección local...",
      stage: "sanitize",
    });

    try {
      const result = await withTimeout(
        executeScriptPipeline(draft, currentUserId, setPipelineProgress),
        IMPORT_TIMEOUT_MS,
        "PIPELINE_TIMEOUT",
      );

      if (!result.setup.characters.length && !result.setup.lines.length) {
        setPipelineBusy(false);
        setPipelineProgress(null);
        fallbackLocalImport(
          draft,
          "No se detectaron personajes con el pipeline; se usa el analizador local.",
        );
        return;
      }

      openReview({
        ...result,
        setup: {
          ...result.setup,
          lines: consolidateScriptLines(result.setup.lines),
        },
      });
    } catch (error) {
      setPipelineBusy(false);
      setPipelineProgress(null);
      const timedOut = error instanceof Error && error.message === "PIPELINE_TIMEOUT";
      fallbackLocalImport(
        draft,
        timedOut
          ? "La detección local tardó demasiado; se importó con el analizador habitual."
          : "No se pudo completar la detección automática; se usa el analizador local.",
      );
    }
  }

  async function runImportPipeline(draft: ScriptImportDraft) {
    if (!currentUserId) {
      toast.error("Inicia sesión para importar libretos.");
      return;
    }

    setPipelineBusy(true);
    setPipelineProgress({
      step: 1,
      totalSteps: 5,
      message: "Segmentando con Gemini...",
      stage: "sanitize",
    });
    setReviewOpen(false);
    setReviewResult(null);

    try {
      const segmented = await withTimeout(
        requestScriptSegment({
          rawText: draft.rawText,
          title: draft.title,
        }),
        IMPORT_TIMEOUT_MS,
        "GEMINI_TIMEOUT",
      );

      const hasLines = Boolean(segmented?.scenes?.some((scene) => scene.lines.length > 0));
      if (segmented && hasLines) {
        const setup = buildScriptSetupFromSegment(draft, currentUserId, segmented);
        openReview(pipelineResultFromSetup(setup, "gemini"));
        return;
      }

      toast.message(
        draft.rawText.length > 14_000
          ? "Gemini no cubre todo el texto; se completa con la detección local."
          : "Gemini no devolvió escenas; se usa la detección local.",
      );
      await runLocalPipelineFallback(draft);
    } catch {
      toast.message("Gemini no disponible o tardó demasiado; se usa la detección local.");
      await runLocalPipelineFallback(draft);
    }
  }

  async function handleImportFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    if (!currentUserId) {
      toast.error("Inicia sesión para importar libretos.");
      return;
    }

    const rawText = await readScriptFile(file);
    const title = file.name
      .replace(/\.[^.]+$/, "")
      .replace(/[-_]+/g, " ")
      .trim();

    await runImportPipeline({
      title: title || "Libreto importado",
      rawText,
      genre: "Importado",
      description: `Importado desde ${file.name}`,
    });
  }

  function openImporter() {
    if (!currentUserId) {
      toast.error("Inicia sesión para importar libretos.");
      return;
    }
    fileInputRef.current?.click();
  }

  function openPasteImporter() {
    if (!currentUserId) {
      toast.error("Inicia sesión para importar libretos.");
      return;
    }
    setPasteTitle("");
    setPasteText("");
    setPasteOpen(true);
  }

  async function confirmPasteImport() {
    const rawText = pasteText.trim();
    if (!rawText) {
      toast.error("Pega el texto del libreto.");
      return;
    }
    setPasteOpen(false);
    await runImportPipeline({
      title: pasteTitle.trim() || "Libreto pegado",
      rawText,
      genre: "Importado",
      description: "Importado desde texto pegado",
    });
  }

  async function confirmPipelineReview() {
    if (!reviewResult || !currentUserId) return;
    setConfirmingImport(true);
    try {
      const method = sourceLabel(reviewResult);
      const renamedSetup = applyCharacterRenames(reviewResult.setup, reviewNames);
      const setup: ScriptSetup = {
        ...renamedSetup,
        script: renamedSetup.script
          ? {
              ...renamedSetup.script,
              title: reviewTitle.trim() || renamedSetup.script.title,
              description: [renamedSetup.script.description, `Detección: ${method}.`]
                .filter(Boolean)
                .join(" "),
              updated_at: new Date().toISOString(),
            }
          : null,
        lines: consolidateScriptLines(renamedSetup.lines),
      };

      const normalizeDialogue = (value: string) => value.replace(/\r\n/g, "\n").trim();
      const originalDialogue = formatDialogueFromSetup(renamedSetup);
      if (normalizeDialogue(reviewDialogue) !== normalizeDialogue(originalDialogue)) {
        // Diálogo editado de verdad: el mismo parser espacial, sin Gemini.
        const reparsed = await executeScriptPipeline(
          {
            title: reviewTitle.trim() || setup.script?.title || "Libreto importado",
            author: setup.script?.author,
            genre: setup.script?.genre ?? "Importado",
            description: setup.script?.description,
            rawText: reviewDialogue,
          },
          currentUserId,
        );
        const script = saveLocalScriptSetup({
          ...reparsed.setup,
          lines: consolidateScriptLines(reparsed.setup.lines),
        });
        refreshScripts();
        setSelectedId(script.id);
        setActiveTab("Mis libretos");
        setReviewOpen(false);
        setReviewResult(null);
        toast.success(`Libreto guardado (${method}).`);
        return;
      }

      const script = saveLocalScriptSetup(setup);
      refreshScripts();
      setSelectedId(script.id);
      setActiveTab("Mis libretos");
      setReviewOpen(false);
      setReviewResult(null);
      toast.success(
        `Libreto guardado con ${setup.characters.length} personaje${setup.characters.length === 1 ? "" : "s"} (${method}).`,
      );
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No se pudo guardar el libreto");
    } finally {
      setConfirmingImport(false);
    }
  }

  function requireOwnedAction(action: () => void) {
    if (!selectedScript) return;
    if (!canEdit) {
      toast.error("Solo puedes modificar libretos importados por tu usuario.");
      return;
    }
    action();
  }

  return (
    <AppShell>
      <TopBar />
      <input
        ref={fileInputRef}
        type="file"
        accept=".txt,.md,.text,.pdf,application/pdf"
        className="hidden"
        onChange={handleImportFile}
      />

      <div className="flex flex-wrap items-end justify-between gap-4 mb-6">
        <div>
          <h1 className="font-display text-4xl">Gestión de libretos</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Crea un libreto o importa .txt, .md o PDF. Se detectan personajes y escenas; si el texto
            viene corrido, un modelo de lenguaje intenta separarlos.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Buscar libretos..."
              className="bg-surface border border-border/60 rounded-lg pl-9 pr-3 py-2 text-sm w-64 focus:outline-none focus:border-primary/50"
            />
          </div>
          <button
            type="button"
            onClick={() => createMutation.mutate()}
            disabled={createMutation.isPending}
            className="inline-flex items-center gap-2 border border-primary/40 text-primary bg-surface rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-60"
          >
            <Plus className="w-4 h-4" />
            {createMutation.isPending ? "Creando..." : "Nuevo libreto"}
          </button>
          <button
            type="button"
            onClick={openPasteImporter}
            disabled={importMutation.isPending || pipelineBusy || confirmingImport}
            className="inline-flex items-center gap-2 border border-border/70 text-foreground bg-surface rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-60"
          >
            Pegar texto
          </button>
          <button
            type="button"
            onClick={openImporter}
            disabled={importMutation.isPending || pipelineBusy || confirmingImport}
            className="inline-flex items-center gap-2 bg-primary-gradient text-primary-foreground rounded-lg px-4 py-2 text-sm font-medium shadow-glow disabled:opacity-60"
          >
            <Upload className="w-4 h-4" />
            {importMutation.isPending || pipelineBusy ? "Importando..." : "Importar libreto"}
          </button>
        </div>
      </div>

      <ScriptPipelineProgress
        progress={pipelineBusy || pipelineProgress ? pipelineProgress : null}
        result={pipelineProgress?.stage === "done" && reviewResult ? reviewResult : null}
        onClose={() => {
          setPipelineProgress(null);
          if (reviewResult) setReviewOpen(true);
        }}
      />

      {pasteOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm p-4">
          <div className="w-full max-w-lg bg-surface border border-border/80 rounded-2xl shadow-2xl p-5 space-y-3">
            <h3 className="font-semibold text-base">Pegar libreto</h3>
            <p className="text-xs text-muted-foreground">
              Pega el texto completo. Se detectarán personajes antes de guardar.
            </p>
            <input
              value={pasteTitle}
              onChange={(event) => setPasteTitle(event.target.value)}
              placeholder="Título (opcional)"
              className="w-full bg-background border border-border/60 rounded-lg px-3 py-2 text-sm"
            />
            <textarea
              value={pasteText}
              onChange={(event) => setPasteText(event.target.value)}
              placeholder={"PERSONAJE:\nDiálogo..."}
              rows={12}
              className="w-full bg-background border border-border/60 rounded-lg px-3 py-2 text-sm font-mono"
            />
            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setPasteOpen(false)}
                className="px-3 py-2 text-sm border border-border rounded-lg"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => void confirmPasteImport()}
                className="px-3 py-2 text-sm bg-primary-gradient text-primary-foreground rounded-lg"
              >
                Detectar personajes
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {reviewOpen && reviewResult ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm p-4">
          <div className="w-full max-w-2xl max-h-[90vh] overflow-y-auto bg-surface border border-border/80 rounded-2xl shadow-2xl p-5 space-y-4">
            <div>
              <h3 className="font-semibold text-base">Revisar importación</h3>
              <p className="text-xs text-muted-foreground mt-1">
                Corrige nombres o diálogo antes de guardar. Método:{" "}
                <span className="text-foreground font-medium">{sourceLabel(reviewResult)}</span>
                {reviewResult.stats.usedTinyLLM ? " · TinyLLM" : ""}.
              </p>
            </div>
            <input
              value={reviewTitle}
              onChange={(event) => setReviewTitle(event.target.value)}
              className="w-full bg-background border border-border/60 rounded-lg px-3 py-2 text-sm"
              placeholder="Título del libreto"
            />
            <div className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground">Personajes detectados</p>
              <div className="grid sm:grid-cols-2 gap-2">
                {reviewNames.map((name, index) => (
                  <input
                    key={`review-char-${index}`}
                    value={name}
                    onChange={(event) => {
                      const next = [...reviewNames];
                      next[index] = event.target.value;
                      setReviewNames(next);
                    }}
                    className="bg-background border border-border/60 rounded-lg px-3 py-2 text-sm"
                  />
                ))}
              </div>
            </div>
            <div className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground">Diálogo</p>
              <textarea
                value={reviewDialogue}
                onChange={(event) => setReviewDialogue(event.target.value)}
                rows={14}
                className="w-full bg-background border border-border/60 rounded-lg px-3 py-2 text-sm font-mono"
              />
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setReviewOpen(false);
                  setReviewResult(null);
                  fallbackLocalImport(
                    {
                      title: reviewTitle || "Libreto importado",
                      rawText: reviewDialogue || reviewResult.setup.script?.raw_text || "",
                      genre: "Importado",
                      description: "Importado sin revisión del pipeline",
                    },
                    "Se guardó con el importador habitual.",
                  );
                }}
                className="px-3 py-2 text-sm border border-border rounded-lg"
                disabled={confirmingImport}
              >
                Usar importador habitual
              </button>
              <button
                type="button"
                onClick={() => void confirmPipelineReview()}
                disabled={confirmingImport}
                className="inline-flex items-center gap-2 px-4 py-2 text-sm bg-primary-gradient text-primary-foreground rounded-lg disabled:opacity-60"
              >
                <Save className="w-4 h-4" />
                {confirmingImport ? "Guardando..." : "Confirmar y guardar"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <div className="grid lg:grid-cols-[1fr_340px] gap-6">
        <div>
          <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
            <div className="flex gap-1 bg-surface rounded-lg p-1 border border-border/60">
              {TABS.map((tab) => (
                <button
                  key={tab}
                  onClick={() => {
                    setActiveTab(tab);
                    setSelectedId(null);
                  }}
                  className={`px-3 py-1.5 text-sm rounded-md transition ${
                    activeTab === tab
                      ? "bg-primary/15 text-primary"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {tab}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-3">
              <select
                value={sortMode}
                onChange={(event) => setSortMode(event.target.value as SortMode)}
                className="text-sm text-muted-foreground border border-border/60 rounded-md px-2.5 py-1.5 bg-surface focus:outline-none focus:border-primary/50"
              >
                <option value="recent">Mas recientes</option>
                <option value="title">Título</option>
                <option value="author">Autor</option>
              </select>
              <div className="flex border border-border/60 rounded-md overflow-hidden bg-surface">
                <button
                  onClick={() => setViewMode("grid")}
                  className={`p-1.5 ${viewMode === "grid" ? "text-primary bg-primary/10" : "text-muted-foreground"}`}
                >
                  <LayoutGrid className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setViewMode("list")}
                  className={`p-1.5 ${viewMode === "list" ? "text-primary bg-primary/10" : "text-muted-foreground"}`}
                >
                  <List className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>

          <div className={viewMode === "grid" ? "grid sm:grid-cols-2 gap-3" : "space-y-3"}>
            {isLoading && (
              <div className="bg-card border border-border/60 rounded-xl p-4 text-sm text-muted-foreground">
                Cargando libretos...
              </div>
            )}
            {isError && (
              <div className="bg-card border border-destructive/40 rounded-xl p-4 text-sm text-destructive">
                No se pudieron cargar los libretos desde la base de datos.
              </div>
            )}
            {!isLoading && !isError && filteredScripts.length === 0 && (
              <div className="bg-card border border-border/60 rounded-xl p-4 text-sm text-muted-foreground">
                No hay libretos para mostrar.
              </div>
            )}
            {filteredScripts.map((script) => (
              <ScriptCard
                key={script.id}
                script={script}
                active={script.id === selectedScript?.id}
                compact={viewMode === "grid"}
                onSelect={() => setSelectedId(script.id)}
                onFavorite={(event) => {
                  event.stopPropagation();
                  if (script.user_id !== currentUserId) {
                    toast.error("Solo puedes marcar favoritos en tus libretos.");
                    return;
                  }
                  favoriteMutation.mutate(script);
                }}
                onEdit={() => {
                  setSelectedId(script.id);
                  setEditing(true);
                }}
                onDuplicate={() => duplicateMutation.mutate(script.id)}
                onRehearse={() => {
                  activeMutation.mutate(script.id);
                  void nav({
                    to: "/configuracion-ensayo",
                    search: { scriptId: script.id },
                  });
                }}
                onTrash={() => deleteMutation.mutate(script.id)}
              />
            ))}
          </div>
          <p className="text-center text-xs text-muted-foreground mt-4">
            {filteredScripts.length} libretos
          </p>
        </div>

        <aside className="bg-card border border-border/60 rounded-xl p-5 h-fit sticky top-6">
          {selectedScript ? (
            <>
              <div className="aspect-[4/3] rounded-lg bg-stage border border-border mb-4 grid place-items-center">
                <DetailIcon className="w-16 h-16 text-primary/60" strokeWidth={0.8} />
              </div>

              {!editing ? (
                <>
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <h3 className="font-display text-xl">{selectedScript.title}</h3>
                      <p className="text-xs text-muted-foreground">
                        {selectedScript.author ?? "Autor desconocido"}
                      </p>
                    </div>
                    <button
                      onClick={() =>
                        requireOwnedAction(() => favoriteMutation.mutate(selectedScript))
                      }
                      className="text-primary disabled:opacity-40"
                    >
                      <Star
                        className={`w-4 h-4 ${selectedScript.is_favorite ? "fill-primary" : ""}`}
                      />
                    </button>
                  </div>

                  <div className="flex flex-wrap gap-1.5 mb-4">
                    {selectedScript.is_active && <Pill label="Activo" tone="primary" />}
                    {selectedScript.source_type === "imported" && <Pill label="Importado" />}
                    {selectedScript.source_type === "created" && <Pill label="Creado" />}
                    {selectedScript.is_public && <Pill label="Público" tone="primary" />}
                    {selectedScript.source_type === "duplicated" && <Pill label="Copia" />}
                    {isTrash && <Pill label="Papelera" tone="danger" />}
                  </div>

                  <dl className="space-y-2 text-sm mb-5">
                    {[
                      ["Género", selectedScript.genre ?? "Sin género"],
                      ["Estructura", formatActCount(selectedScript.act_count)],
                      ["Escenas", `${details?.scenes.length ?? 0}`],
                      ["Personajes", `${details?.characters.length ?? 0}`],
                      ["Líneas", `${details?.lines.length ?? 0}`],
                      ["Última actualización", formatRelativeDate(selectedScript.updated_at)],
                    ].map(([key, value]) => (
                      <div key={key} className="flex justify-between gap-2 text-xs">
                        <dt className="text-muted-foreground">{key}</dt>
                        <dd className="text-foreground">{value}</dd>
                      </div>
                    ))}
                  </dl>

                  <div className="mb-5">
                    <p className="text-xs text-muted-foreground uppercase tracking-wider mb-2">
                      Descripción
                    </p>
                    <p className="text-xs leading-relaxed text-foreground/80">
                      {selectedScript.description ?? "Este libreto aun no tiene descripcion."}
                    </p>
                  </div>

                  {showCharacters && (
                    <div className="mb-5 border border-border/60 rounded-lg p-3 bg-surface/60">
                      <p className="text-xs text-muted-foreground uppercase tracking-wider mb-2">
                        Personajes
                      </p>
                      <div className="space-y-1.5">
                        {(details?.characters ?? []).map((character) => (
                          <div
                            key={character.id}
                            className="flex items-center justify-between text-xs"
                          >
                            <span>{character.name}</span>
                            <span className="text-muted-foreground">
                              {character.actor_type === "user" ? "Tú" : "Voz"}
                            </span>
                          </div>
                        ))}
                        {(details?.characters.length ?? 0) === 0 && (
                          <p className="text-xs text-muted-foreground">
                            Sin personajes registrados.
                          </p>
                        )}
                      </div>
                    </div>
                  )}
                </>
              ) : (
                <EditForm
                  value={editForm}
                  onChange={setEditForm}
                  onCancel={() => setEditing(false)}
                  onSave={() => updateMutation.mutate()}
                  saving={updateMutation.isPending}
                />
              )}

              <div className="space-y-2">
                <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">
                  Acciones
                </p>

                {!isTrash && (
                  <>
                    <ActionButton
                      icon={CheckCircle2}
                      label="Usar en ensayo"
                      onClick={() => activeMutation.mutate(selectedScript)}
                    />
                    <ActionButton
                      icon={Edit}
                      label="Editar libreto"
                      onClick={() => requireOwnedAction(() => setEditing(true))}
                    />
                    <ActionButton
                      icon={Users}
                      label={showCharacters ? "Ocultar personajes" : "Ver personajes"}
                      onClick={() => setShowCharacters((current) => !current)}
                    />
                    <ActionButton
                      icon={Copy}
                      label="Duplicar"
                      onClick={() => duplicateMutation.mutate(selectedScript.id)}
                    />
                    <button
                      onClick={() =>
                        requireOwnedAction(() => deleteMutation.mutate(selectedScript))
                      }
                      className="w-full flex items-center gap-2 text-sm p-2.5 rounded-lg text-destructive hover:bg-destructive/10 transition"
                    >
                      <Trash2 className="w-4 h-4" /> Eliminar libreto
                    </button>
                  </>
                )}

                {isTrash && (
                  <>
                    <ActionButton
                      icon={RotateCcw}
                      label="Restaurar libreto"
                      onClick={() => restoreMutation.mutate(selectedScript)}
                    />
                    <button
                      onClick={() => hardDeleteMutation.mutate(selectedScript)}
                      className="w-full flex items-center gap-2 text-sm p-2.5 rounded-lg text-destructive hover:bg-destructive/10 transition"
                    >
                      <Trash2 className="w-4 h-4" /> Eliminar definitivamente
                    </button>
                  </>
                )}
              </div>

              {!isTrash && (
                <Link
                  to="/configuracion-ensayo"
                  className="mt-5 block text-center bg-primary-gradient text-primary-foreground rounded-lg py-2 text-sm font-medium"
                >
                  Configurar ensayo
                </Link>
              )}
            </>
          ) : (
            <div className="text-sm text-muted-foreground">
              Selecciona un libreto para ver detalles.
            </div>
          )}
        </aside>
      </div>
    </AppShell>
  );
}

function ScriptCard({
  script,
  active,
  compact,
  onSelect,
  onFavorite,
  onEdit,
  onDuplicate,
  onRehearse,
  onTrash,
}: {
  script: ScriptRecord;
  active: boolean;
  compact: boolean;
  onSelect: () => void;
  onFavorite: (event: MouseEvent<HTMLButtonElement>) => void;
  onEdit: () => void;
  onDuplicate: () => void;
  onRehearse: () => void;
  onTrash: () => void;
}) {
  const Icon = getScriptIcon(script);

  return (
    <div
      onClick={onSelect}
      className={`bg-card border rounded-xl p-4 transition cursor-pointer ${
        active ? "border-primary/60 shadow-glow" : "border-border/60 hover:border-primary/30"
      } ${compact ? "space-y-3" : "flex items-center gap-4"}`}
    >
      <div className="w-14 h-14 rounded-lg bg-stage border border-border grid place-items-center text-primary shrink-0">
        <Icon className="w-6 h-6" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <h3 className="font-display text-lg truncate">{script.title}</h3>
          {script.is_active && <span className="w-1.5 h-1.5 rounded-full bg-success" />}
        </div>
        <p className="text-xs text-muted-foreground mb-1.5">
          {script.author ?? "Autor desconocido"}
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[11px] px-2 py-0.5 rounded-full border border-border text-muted-foreground">
            {script.genre ?? "Sin genero"}
          </span>
          <span className="text-[11px] px-2 py-0.5 rounded-full border border-border text-muted-foreground">
            {formatActCount(script.act_count)}
          </span>
          {script.deleted_at && (
            <span className="text-[11px] px-2 py-0.5 rounded-full border border-destructive/40 text-destructive">
              Papelera
            </span>
          )}
        </div>
      </div>
      <span className="text-xs text-muted-foreground hidden md:block">
        Actualizado {formatRelativeDate(script.updated_at)}
      </span>
      <div className="flex items-center gap-1 ml-auto">
        <button onClick={onFavorite} className="text-primary p-1">
          <Star className={`w-4 h-4 ${script.is_favorite ? "fill-primary" : ""}`} />
        </button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              aria-label="Acciones del libreto"
              className="p-1 text-muted-foreground hover:text-foreground"
              onClick={(event) => event.stopPropagation()}
            >
              <MoreVertical className="w-4 h-4" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" onClick={(event) => event.stopPropagation()}>
            <DropdownMenuItem onClick={onEdit}>Editar</DropdownMenuItem>
            <DropdownMenuItem onClick={onDuplicate}>Duplicar</DropdownMenuItem>
            <DropdownMenuItem onClick={onRehearse}>Usar en ensayo</DropdownMenuItem>
            <DropdownMenuItem onClick={onTrash}>Mover a papelera</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}

function EditForm({
  value,
  onChange,
  onCancel,
  onSave,
  saving,
}: {
  value: {
    title: string;
    author: string;
    genre: string;
    act_count: number;
    description: string;
    dialogue: string;
  };
  onChange: (value: {
    title: string;
    author: string;
    genre: string;
    act_count: number;
    description: string;
    dialogue: string;
  }) => void;
  onCancel: () => void;
  onSave: () => void;
  saving: boolean;
}) {
  return (
    <div className="space-y-3 mb-5">
      <TextField
        label="Título"
        value={value.title}
        onChange={(title) => onChange({ ...value, title })}
      />
      <TextField
        label="Autor"
        value={value.author}
        onChange={(author) => onChange({ ...value, author })}
      />
      <div className="grid grid-cols-[1fr_96px] gap-2">
        <TextField
          label="Género"
          value={value.genre}
          onChange={(genre) => onChange({ ...value, genre })}
        />
        <div>
          <label className="text-[10px] tracking-[0.2em] text-muted-foreground uppercase">
            Actos
          </label>
          <input
            type="number"
            min={1}
            value={value.act_count}
            onChange={(event) => onChange({ ...value, act_count: Number(event.target.value) || 1 })}
            className="w-full mt-1 bg-surface border border-border/60 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-primary/50"
          />
        </div>
      </div>
      <div>
        <label className="text-[10px] tracking-[0.2em] text-muted-foreground uppercase">
          Descripción
        </label>
        <textarea
          value={value.description}
          onChange={(event) => onChange({ ...value, description: event.target.value })}
          rows={4}
          className="w-full mt-1 bg-surface border border-border/60 rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:border-primary/50"
        />
      </div>
      <div>
        <label className="text-[10px] tracking-[0.2em] text-muted-foreground uppercase">
          Diálogo
        </label>
        <textarea
          value={value.dialogue}
          onChange={(event) => onChange({ ...value, dialogue: event.target.value })}
          rows={10}
          spellCheck
          placeholder={
            "Actor:\nEscribe aquí tu línea.\n\nCompañero:\nRespuesta del otro personaje."
          }
          className="w-full mt-1 bg-surface border border-border/60 rounded-lg px-3 py-2 text-sm resize-y min-h-40 focus:outline-none focus:border-primary/50 font-mono"
        />
        <p className="text-[11px] text-muted-foreground mt-1">
          Una línea por párrafo. Formato: Nombre: y el texto debajo o en la misma línea.
        </p>
      </div>
      <div className="flex gap-2">
        <button
          onClick={onSave}
          disabled={saving}
          className="flex-1 inline-flex items-center justify-center gap-2 bg-primary-gradient text-primary-foreground rounded-lg px-3 py-2 text-sm disabled:opacity-60"
        >
          <Save className="w-4 h-4" /> {saving ? "Guardando..." : "Guardar"}
        </button>
        <button
          onClick={onCancel}
          className="inline-flex items-center justify-center border border-border/60 bg-surface rounded-lg px-3 py-2 text-sm"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

function TextField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div>
      <label className="text-[10px] tracking-[0.2em] text-muted-foreground uppercase">
        {label}
      </label>
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="w-full mt-1 bg-surface border border-border/60 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-primary/50"
      />
    </div>
  );
}

function ActionButton({
  icon: Icon,
  label,
  onClick,
}: {
  icon: typeof Edit;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="w-full flex items-center justify-between gap-2 text-sm p-2.5 rounded-lg bg-surface border border-border/40 hover:border-primary/40 hover:text-primary transition"
    >
      <span className="flex items-center gap-2">
        <Icon className="w-4 h-4" /> {label}
      </span>
      <ChevronRight className="w-4 h-4 text-muted-foreground" />
    </button>
  );
}

function Pill({
  label,
  tone = "neutral",
}: {
  label: string;
  tone?: "neutral" | "primary" | "danger";
}) {
  const className =
    tone === "primary"
      ? "border-primary/40 text-primary"
      : tone === "danger"
        ? "border-destructive/40 text-destructive"
        : "border-border text-muted-foreground";

  return (
    <span className={`text-[11px] px-2 py-0.5 rounded-full border ${className}`}>{label}</span>
  );
}
