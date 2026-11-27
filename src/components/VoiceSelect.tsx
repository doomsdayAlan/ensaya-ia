import { useEffect, useId, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { AZURE_VOICES, voiceDisplayName, type AzureVoice } from "@/lib/azure-voices";
import {
  loadAvailableAzureVoices,
  startVoicePreview,
  stopVoicePreview,
  subscribeVoicePreview,
} from "@/lib/voice-service";

export function VoiceSelect({
  label,
  value,
  systemVoices,
  onChange,
  previewText = "Así suena la voz elegida",
}: {
  label: string;
  value: string;
  systemVoices: string[];
  onChange: (value: string) => void;
  previewText?: string;
}) {
  const [open, setOpen] = useState(false);
  const [azureVoices, setAzureVoices] = useState<AzureVoice[]>([]);
  const [previewing, setPreviewing] = useState<string | null>(null);
  const previewingRef = useRef<string | null>(null);
  const fieldId = useId();

  useEffect(() => {
    let active = true;
    void loadAvailableAzureVoices().then((voices) => {
      if (active) setAzureVoices(Array.isArray(voices) ? voices : []);
    });
    return () => {
      active = false;
    };
  }, []);

  useEffect(
    () =>
      subscribeVoicePreview((voice) => {
        previewingRef.current = voice;
        setPreviewing(voice);
      }),
    [],
  );

  useEffect(
    () => () => {
      if (previewingRef.current === value) stopVoicePreview();
    },
    [value],
  );

  const female = azureVoices.filter((voice) => voice.gender === "femenina");
  const male = azureVoices.filter((voice) => voice.gender === "masculina");
  const systems = (Array.isArray(systemVoices) ? systemVoices : []).filter(
    (voice) => !AZURE_VOICES.some((item) => item.name === voice),
  );
  const playing = previewing === value;

  return (
    <div>
      <label
        htmlFor={fieldId}
        className="text-[10px] tracking-[0.2em] text-muted-foreground uppercase"
      >
        {label}
      </label>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            id={fieldId}
            type="button"
            className="mt-1 flex w-full items-center gap-2 rounded-lg border border-input bg-surface px-3 py-2 text-left text-sm text-foreground focus:outline-none focus:border-ring focus:ring-2 focus:ring-ring"
          >
            <span className="min-w-0 flex-1 truncate">{voiceDisplayName(value)}</span>
            <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
          </button>
        </PopoverTrigger>
        <PopoverContent
          align="start"
          sideOffset={8}
          className="max-h-72 w-[var(--radix-popover-trigger-width)] overflow-y-auto rounded-xl border-border bg-popover p-2 text-sm text-popover-foreground shadow-elevated"
        >
          <VoiceGroup
            title="Femeninas"
            options={female.map((voice) => ({ value: voice.name, label: voice.name }))}
            selected={value}
            onSelect={(next) => {
              onChange(next);
              setOpen(false);
            }}
          />
          <VoiceGroup
            title="Masculinas"
            options={male.map((voice) => ({ value: voice.name, label: voice.name }))}
            selected={value}
            onSelect={(next) => {
              onChange(next);
              setOpen(false);
            }}
          />
          <VoiceGroup
            title="Voces del sistema"
            options={systems.map((voice) => ({ value: voice, label: voice }))}
            selected={value}
            onSelect={(next) => {
              onChange(next);
              setOpen(false);
            }}
          />
        </PopoverContent>
      </Popover>
      <button
        type="button"
        className="mt-2 text-xs text-primary hover:underline"
        onClick={() => {
          if (playing) stopVoicePreview();
          else startVoicePreview(value, previewText);
        }}
      >
        {playing ? "Detener vista previa" : "Escuchar vista previa"}
      </button>
    </div>
  );
}

function VoiceGroup({
  title,
  options,
  selected,
  onSelect,
}: {
  title: string;
  options: { value: string; label: string }[];
  selected: string;
  onSelect: (value: string) => void;
}) {
  if (!options.length) return null;
  return (
    <div className="mb-1">
      <p className="px-3 py-1 text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
        {title}
      </p>
      {options.map((option) => {
        const active = option.value === selected || voiceDisplayName(selected) === option.label;
        return (
          <button
            key={`${title}-${option.value}`}
            type="button"
            onClick={() => onSelect(option.value)}
            className={`block w-full rounded-lg px-3 py-2 text-left transition ${
              active
                ? "bg-accent font-medium text-accent-foreground"
                : "text-foreground hover:bg-accent/70"
            }`}
          >
            <span className="block truncate">{option.label}</span>
          </button>
        );
      })}
    </div>
  );
}
