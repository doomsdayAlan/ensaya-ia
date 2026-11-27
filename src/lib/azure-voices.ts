export type VoiceGender = "femenina" | "masculina";

export type AzureVoice = {
  id: string;
  name: string;
  gender: VoiceGender;
  locale: string;
};

export const AZURE_VOICES: readonly AzureVoice[] = [
  { id: "es-CO-SalomeNeural", name: "Salomé", gender: "femenina", locale: "es-CO" },
  { id: "es-ES-XimenaNeural", name: "Ximena", gender: "femenina", locale: "es-ES" },
  { id: "es-MX-DaliaNeural", name: "Dalia", gender: "femenina", locale: "es-MX" },
  {
    id: "es-MX-DaliaMultilingualNeural",
    name: "Dalia Multilingüe",
    gender: "femenina",
    locale: "es-MX",
  },
  { id: "es-CR-JuanNeural", name: "Juan", gender: "masculina", locale: "es-CR" },
  { id: "es-MX-GerardoNeural", name: "Gerardo", gender: "masculina", locale: "es-MX" },
  { id: "es-PR-VictorNeural", name: "Víctor", gender: "masculina", locale: "es-PR" },
  { id: "es-PY-MarioNeural", name: "Mario", gender: "masculina", locale: "es-PY" },
] as const;

const FEMALE_NAMES = new Set([
  "MARTA",
  "MARIA",
  "ANA",
  "JULIETA",
  "MADRE",
  "ABUELA",
  "SOFIA",
  "LUCIA",
  "CARMEN",
  "LAURA",
  "ELENA",
  "ROSA",
  "INES",
  "PAULA",
  "CLARA",
  "BEATRIZ",
  "CAPERUCITA",
]);

const MALE_NAMES = new Set([
  "JUAN",
  "PEDRO",
  "GENARO",
  "MATEO",
  "DIEGO",
  "ROMEO",
  "PADRE",
  "ABUELO",
  "CARLOS",
  "LUIS",
  "JOSE",
  "ALEJANDRO",
  "LUPERCIO",
]);

export function findAzureVoice(stored: unknown): AzureVoice | null {
  if (typeof stored !== "string") return null;
  const value = stored.trim();
  if (!value) return null;
  const bare = value.replace(/^azure:/i, "");
  return (
    AZURE_VOICES.find((voice) => voice.id === bare || voice.id === value || voice.name === value) ??
    null
  );
}

export function voiceDisplayName(stored: unknown) {
  if (typeof stored !== "string") return "Voz del sistema";
  const azure = findAzureVoice(stored);
  if (azure) return azure.name;
  const value = stored.trim();
  return value || "Voz del sistema";
}

export function inferCastGender(name: string): VoiceGender | "neutral" {
  const first = name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .split(/\s+/)[0];
  if (!first) return "neutral";
  if (FEMALE_NAMES.has(first) || first.endsWith("A")) return "femenina";
  if (MALE_NAMES.has(first) || first.endsWith("O")) return "masculina";
  return "neutral";
}

/** Asigna voces de Azure del género que se pueda deducir, sin repetir mientras alcancen. */
export function createCastAssigner(alreadyUsed: Iterable<string | null | undefined> = []) {
  const used = new Set<string>();
  for (const stored of alreadyUsed) {
    const voice = findAzureVoice(stored);
    if (voice) used.add(voice.id);
  }
  let alternate: VoiceGender = "femenina";
  const female = AZURE_VOICES.filter((voice) => voice.gender === "femenina");
  const male = AZURE_VOICES.filter((voice) => voice.gender === "masculina");

  return (name: string) => {
    const gender = inferCastGender(name);
    const pool =
      gender === "masculina"
        ? male
        : gender === "femenina"
          ? female
          : alternate === "femenina"
            ? female
            : male;
    if (gender === "neutral") alternate = alternate === "femenina" ? "masculina" : "femenina";
    const pick = pool.find((voice) => !used.has(voice.id)) ?? pool[0];
    if (!pick) return "Dalia";
    used.add(pick.id);
    return pick.name;
  };
}
