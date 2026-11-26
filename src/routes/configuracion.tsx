import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { toast } from "sonner";
import { AppShell } from "@/components/AppShell";
import { TopBar } from "@/components/TopBar";
import {
  Mic,
  Volume2,
  Bell,
  Shield,
  Download,
  Save,
  User,
  LogIn,
  Database,
  ChevronDown,
} from "lucide-react";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  applyPrivacyToMyScripts,
  getPerfilUsuario,
  updatePerfilUsuario,
} from "@/lib/rehearsal-data";
import { requestNotificationPermission } from "@/lib/session-prefs";
import { isAuthRequired, setAuthRequired } from "@/lib/app-config";
import { getStoredUserCount } from "@/lib/local-auth";
import { listBrowserVoiceNames, speakLine } from "@/lib/rehearsal-ai";
import { THEME_OPTIONS, useThemePreference, type ThemePreference } from "@/lib/theme";

export const Route = createFileRoute("/configuracion")({
  component: Configuracion,
});

const MODES = [
  ["individual", "Individual"],
  ["grupo", "En grupo"],
  ["lectura", "Lectura"],
] as const;
const PRIVACY = [
  ["privado", "Privado"],
  ["equipo", "Equipo"],
  ["publico", "Público"],
] as const;
const THEME_CHOICES: Record<ThemePreference, string> = {
  light: "Claro",
  dark: "Oscuro",
  system: "Según el sistema",
};

function Configuracion() {
  const queryClient = useQueryClient();
  const { data, isError, isLoading } = useQuery({
    queryKey: ["perfil-usuario"],
    queryFn: getPerfilUsuario,
  });
  const profile = data?.profile;
  const [displayName, setDisplayName] = useState("");
  const [preferredVoice, setPreferredVoice] = useState("Tu voz");
  const [browserVoices, setBrowserVoices] = useState<string[]>([]);
  const [mode, setMode] = useState("individual");
  const [difficulty, setDifficulty] = useState(50);
  const [notifications, setNotifications] = useState(true);
  const [offline, setOffline] = useState(false);
  const [interpretationAudio, setInterpretationAudio] = useState(true);
  const [privacy, setPrivacy] = useState("privado");
  const [requireLogin, setRequireLogin] = useState(true);
  const [storedUsers, setStoredUsers] = useState(0);
  const { preference: themePreference, setTheme } = useThemePreference();

  useEffect(() => {
    setRequireLogin(isAuthRequired());
    void getStoredUserCount().then(setStoredUsers);
  }, []);

  useEffect(() => {
    const load = () => setBrowserVoices(listBrowserVoiceNames());
    load();
    const synth = window.speechSynthesis;
    synth?.addEventListener("voiceschanged", load);
    return () => synth?.removeEventListener("voiceschanged", load);
  }, []);

  useEffect(() => {
    if (!profile) return;
    setDisplayName(profile.display_name ?? "");
    setPreferredVoice(profile.preferred_voice);
    setMode(profile.rehearsal_mode);
    setDifficulty(profile.ai_difficulty);
    setNotifications(profile.notifications_enabled);
    setOffline(profile.offline_mode_enabled);
    setInterpretationAudio(profile.interpretation_audio_enabled !== false);
    setPrivacy(profile.privacy_level);
  }, [profile]);

  const saveProfile = useMutation({
    mutationFn: async () => {
      const saved = await updatePerfilUsuario({
        display_name: displayName,
        preferred_voice: preferredVoice,
        rehearsal_mode: mode,
        ai_difficulty: difficulty,
        notifications_enabled: notifications,
        offline_mode_enabled: offline,
        interpretation_audio_enabled: interpretationAudio,
        privacy_level: privacy,
      });
      const privacyChanged = await applyPrivacyToMyScripts(privacy);
      return { saved, privacyChanged };
    },
    onSuccess: ({ privacyChanged }) => {
      queryClient.invalidateQueries({ queryKey: ["perfil-usuario"] });
      queryClient.invalidateQueries({ queryKey: ["scripts"] });
      if (notifications) {
        void requestNotificationPermission().then((permission) => {
          if (permission === "denied") {
            toast.error(
              "El navegador bloqueó las notificaciones del sistema. Los avisos de sesión de la app siguen activos.",
            );
          }
        });
      }
      const parts = ["Perfil guardado"];
      parts.push(
        notifications
          ? "avisos de sesión activos"
          : "avisos de sesión desactivados (los errores se siguen mostrando)",
      );
      parts.push(
        offline
          ? "modo sin conexión: las notas del director usan plantillas locales"
          : "notas del director con modelo de lenguaje si está configurado, o plantillas locales",
      );
      if (privacy === "publico") {
        parts.push(
          privacyChanged
            ? "tus libretos ahora aparecen como públicos"
            : "tus libretos siguen públicos",
        );
      } else {
        parts.push(
          privacyChanged
            ? "tus libretos quedan privados en este dispositivo"
            : "tus libretos siguen privados",
        );
      }
      toast.success(parts.join(". "));
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "No se pudo guardar"),
  });

  return (
    <AppShell>
      <TopBar />
      <div className="flex flex-wrap items-end justify-between gap-4 mb-6">
        <div>
          <h1 className="font-display text-4xl">Configuración</h1>
        </div>
        <button
          onClick={() => saveProfile.mutate()}
          disabled={!data?.isAuthenticated || saveProfile.isPending}
          className="inline-flex items-center gap-2 bg-primary-gradient text-primary-foreground rounded-lg px-4 py-2 text-sm font-medium shadow-glow disabled:opacity-60 disabled:cursor-not-allowed"
        >
          <Save className="w-4 h-4" /> {saveProfile.isPending ? "Guardando..." : "Guardar cambios"}
        </button>
      </div>

      {isLoading && (
        <div className="bg-card border border-border/60 rounded-xl p-5 text-sm text-muted-foreground">
          Cargando perfil...
        </div>
      )}
      {isError && (
        <div className="bg-card border border-destructive/40 rounded-xl p-5 text-sm text-destructive">
          No se pudo cargar tu perfil.
        </div>
      )}
      {data && !data.isAuthenticated && (
        <div className="bg-card border border-primary/30 rounded-xl p-4 text-sm text-muted-foreground mb-5">
          Estás viendo valores de invitado. Inicia sesión para guardar tu perfil en este
          dispositivo.
        </div>
      )}

      <section className="bg-card border border-border/60 rounded-xl p-5 mb-5">
        <h2 className="font-medium mb-4">Apariencia</h2>
        <RadioGroup
          value={themePreference}
          onValueChange={(value) => {
            if (value === "light" || value === "dark" || value === "system") setTheme(value);
          }}
          className="grid gap-2 sm:grid-cols-3"
        >
          {THEME_OPTIONS.map((value) => {
            const selected = themePreference === value;
            return (
              <Label
                key={value}
                className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm font-normal ${
                  selected
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border bg-surface text-foreground hover:border-primary/40"
                }`}
              >
                <RadioGroupItem value={value} />
                {THEME_CHOICES[value]}
              </Label>
            );
          })}
        </RadioGroup>
      </section>

      {profile && (
        <div className="grid lg:grid-cols-[1.1fr_0.9fr] gap-5">
          <section className="bg-card border border-border/60 rounded-xl p-5">
            <div className="flex items-center gap-3 mb-5">
              <div className="w-11 h-11 rounded-full border border-primary/30 bg-primary/5 grid place-items-center text-primary">
                <User className="w-5 h-5" />
              </div>
              <div>
                <h2 className="font-medium">Perfil de usuario</h2>
                <p className="text-xs text-muted-foreground">
                  {profile.email ?? "Sin correo sincronizado"}
                </p>
              </div>
            </div>
            <label className="text-[10px] tracking-[0.2em] text-muted-foreground uppercase">
              Nombre visible
            </label>
            <input
              value={displayName}
              onChange={(event) => setDisplayName(event.target.value)}
              className="mt-1 mb-5 w-full bg-surface border border-input rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-ring focus:ring-2 focus:ring-ring"
              placeholder="Tu nombre artístico"
            />
            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <SelectBlock
                  icon={Volume2}
                  title="Voz del director / lector"
                  value={preferredVoice}
                  options={Array.from(
                    new Set(["Tu voz", preferredVoice, ...browserVoices].filter(Boolean)),
                  ).map((voice) => [voice, voice] as const)}
                  onChange={setPreferredVoice}
                />
                <button
                  type="button"
                  className="mt-2 text-xs text-primary hover:underline"
                  onClick={() => {
                    void speakLine("Así suena la voz elegida.", preferredVoice).catch(() => {
                      toast.error("Este navegador no tiene voces en español para la vista previa.");
                    });
                  }}
                >
                  Escuchar vista previa
                </button>
                {browserVoices.length === 0 ? (
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    Si el navegador aún no lista voces, recarga la página. Se usan las voces
                    instaladas, sin un servicio de pago.
                  </p>
                ) : null}
              </div>
              <SelectBlock
                icon={Mic}
                title="Modo de ensayo"
                value={mode}
                options={MODES}
                onChange={setMode}
              />
            </div>
            <div className="mt-5">
              <div className="flex items-center justify-between text-xs mb-2">
                <span className="text-muted-foreground">Dificultad IA</span>
                <span className="text-primary">{difficulty}%</span>
              </div>
              <input
                type="range"
                min={0}
                max={100}
                value={difficulty}
                onChange={(event) => setDifficulty(Number(event.target.value))}
                className="w-full accent-primary"
              />
            </div>
          </section>

          <section className="grid gap-4">
            <div className="bg-card border border-border/60 rounded-xl p-5">
              <div className="flex items-start gap-3">
                <div className="w-11 h-11 rounded-full border border-primary/30 bg-primary/5 grid place-items-center text-primary">
                  <Database className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-medium">Base de datos de cuentas</h3>
                  <p className="text-sm text-muted-foreground">
                    Las cuentas se guardan en este navegador. {storedUsers} cuenta
                    {storedUsers === 1 ? "" : "s"} guardada{storedUsers === 1 ? "" : "s"}.
                  </p>
                </div>
              </div>
            </div>
            {import.meta.env.DEV && (
              <SettingCard
                icon={LogIn}
                title="Pedir inicio de sesión (solo desarrollo)"
                desc="En producción manda VITE_REQUIRE_AUTH. Este interruptor no aparece fuera de desarrollo."
                enabled={requireLogin}
                onToggle={(value) => {
                  setRequireLogin(value);
                  setAuthRequired(value);
                  toast.success(
                    value
                      ? "La app pedirá sesión para entrar"
                      : "La app permite entrar como invitado",
                  );
                }}
              />
            )}
            <SettingCard
              icon={Bell}
              title="Notificaciones"
              desc="Si está activo, avisa al iniciar y al guardar un ensayo. Si lo apagas, esos avisos desaparecen."
              enabled={notifications}
              onToggle={setNotifications}
            />
            <SettingCard
              icon={Download}
              title="Modo sin conexión"
              desc="Las notas del director usan plantillas locales. El ensayo y los libretos siguen en este dispositivo. En este modo no se envía audio."
              enabled={offline}
              onToggle={setOffline}
            />
            <SettingCard
              icon={Mic}
              title="Enviar el audio para consejos de interpretación"
              desc="Con los términos aceptados, las tomas de tu voz se envían al cerrar el ensayo para un consejo orientativo. Puedes apagarlo. El modo sin conexión tampoco lo envía."
              enabled={interpretationAudio}
              onToggle={setInterpretationAudio}
            />
            <div className="bg-card border border-border/60 rounded-xl p-5">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-11 h-11 rounded-full border border-primary/30 bg-primary/5 grid place-items-center text-primary">
                  <Shield className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-medium">Privacidad</h3>
                  <p className="text-sm text-muted-foreground">
                    Público muestra tus libretos a otras cuentas de este dispositivo. Privado y
                    Equipo los ocultan.
                  </p>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-2">
                {PRIVACY.map(([value, label]) => (
                  <button
                    key={value}
                    onClick={() => setPrivacy(value)}
                    className={`rounded-lg border px-3 py-2 text-sm transition ${
                      privacy === value
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border bg-surface text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          </section>
        </div>
      )}
    </AppShell>
  );
}

function SelectBlock({
  icon: Icon,
  title,
  value,
  options,
  onChange,
}: {
  icon: typeof Mic;
  title: string;
  value: string;
  options: readonly (readonly [string, string])[];
  onChange: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const selected = options.find(([optionValue]) => optionValue === value)?.[1] ?? value;

  return (
    <div>
      <label className="text-[10px] tracking-[0.2em] text-muted-foreground uppercase">
        {title}
      </label>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            className="mt-1 flex w-full items-center gap-2 rounded-lg border border-input bg-surface px-3 py-2 text-left text-sm text-foreground focus:outline-none focus:border-ring focus:ring-2 focus:ring-ring"
          >
            <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
            <span className="min-w-0 flex-1 truncate">{selected}</span>
            <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
          </button>
        </PopoverTrigger>
        <PopoverContent
          align="start"
          sideOffset={8}
          className="max-h-64 w-[var(--radix-popover-trigger-width)] overflow-y-auto rounded-xl border-border bg-popover p-2 text-sm text-popover-foreground shadow-elevated"
        >
          <div className="flex flex-col gap-0.5">
            {options.map(([optionValue, label]) => {
              const active = optionValue === value;
              return (
                <button
                  key={optionValue}
                  type="button"
                  onClick={() => {
                    onChange(optionValue);
                    setOpen(false);
                  }}
                  className={`rounded-lg px-3 py-2 text-left transition ${
                    active
                      ? "bg-accent font-medium text-accent-foreground"
                      : "text-foreground hover:bg-accent/70"
                  }`}
                >
                  {label}
                </button>
              );
            })}
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}

function SettingCard({
  icon: Icon,
  title,
  desc,
  enabled,
  onToggle,
}: {
  icon: typeof Bell;
  title: string;
  desc: string;
  enabled: boolean;
  onToggle: (value: boolean) => void;
}) {
  return (
    <button
      onClick={() => onToggle(!enabled)}
      className="bg-card border border-border/60 rounded-xl p-5 text-left hover:border-primary/40 transition"
    >
      <div className="flex items-start gap-3">
        <div className="w-11 h-11 rounded-full border border-primary/30 bg-primary/5 grid place-items-center text-primary">
          <Icon className="w-5 h-5" />
        </div>
        <div className="flex-1">
          <h3 className="font-medium mb-1">{title}</h3>
          <p className="text-sm text-muted-foreground">{desc}</p>
        </div>
        <span
          className={`relative h-6 w-10 shrink-0 rounded-full transition-colors ${enabled ? "bg-primary" : "bg-input"}`}
        >
          <span
            className={`absolute top-0.5 left-0.5 h-5 w-5 rounded-full shadow-sm transition-transform ${enabled ? "translate-x-4 bg-primary-foreground" : "translate-x-0 bg-foreground"}`}
          />
        </span>
      </div>
    </button>
  );
}
