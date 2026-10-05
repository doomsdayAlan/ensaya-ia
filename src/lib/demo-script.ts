import type { CharacterRecord, SceneRecord, ScriptLineWithCharacter, ScriptRecord } from "@/lib/rehearsal-data";
import type { ScriptSetup } from "@/lib/rehearsal-data";

const now = "2026-01-01T00:00:00.000Z";

export const DEMO_SCRIPT_ID = "00000000-0000-4000-8000-000000000101";
export const DEMO_SCENE_ID = "00000000-0000-4000-8000-000000000202";
export const DEMO_ROMEO_ID = "00000000-0000-4000-8000-000000000301";
export const DEMO_JULIETA_ID = "00000000-0000-4000-8000-000000000302";

export const DEMO_SCRIPT: ScriptRecord = {
  id: DEMO_SCRIPT_ID,
  user_id: null,
  title: "Romeo y Julieta",
  author: "William Shakespeare",
  genre: "Drama",
  act_count: 2,
  description:
    "Escena del balcon para ensayar en local. Si Supabase no responde, usamos este libreto de demostracion.",
  is_favorite: true,
  is_active: true,
  is_public: true,
  created_at: now,
  updated_at: now,
  raw_text: null,
  source_type: "seed",
  imported_at: null,
  deleted_at: null,
};

export const DEMO_SCENE: SceneRecord = {
  id: DEMO_SCENE_ID,
  script_id: DEMO_SCRIPT_ID,
  title: "Escena 2 - Balcon",
  location: "Patio de la casa Capuleto",
  description: "Romeo visita a Julieta en su balcon durante la noche.",
  sort_order: 2,
  created_at: now,
};

export const DEMO_CHARACTERS: CharacterRecord[] = [
  {
    id: DEMO_ROMEO_ID,
    script_id: DEMO_SCRIPT_ID,
    name: "Romeo",
    role: "Protagonista",
    actor_type: "user",
    voice: "Tu voz",
    base_emotion: "Enamorado",
    sort_order: 1,
    created_at: now,
  },
  {
    id: DEMO_JULIETA_ID,
    script_id: DEMO_SCRIPT_ID,
    name: "Julieta",
    role: "Protagonista",
    actor_type: "ai",
    voice: "Sofia (Femenina)",
    base_emotion: "Romantica",
    sort_order: 2,
    created_at: now,
  },
];

const LINES: Array<{ id: string; characterId: string; order: number; text: string; cue: string; duration: number }> =
  [
    {
      id: "00000000-0000-4000-8000-000000000501",
      characterId: DEMO_ROMEO_ID,
      order: 1,
      text: "De que luz se alimenta esa ventana? Es el este, y Julieta es el sol!",
      cue: "Tu linea. Habla en voz alta.",
      duration: 6,
    },
    {
      id: "00000000-0000-4000-8000-000000000502",
      characterId: DEMO_JULIETA_ID,
      order: 2,
      text: "Es Romeo, y Romeo es el mismo! Ah, Romeo, por que eres tu Romeo!",
      cue: "La IA interpreta a Julieta.",
      duration: 4,
    },
    {
      id: "00000000-0000-4000-8000-000000000503",
      characterId: DEMO_ROMEO_ID,
      order: 3,
      text: "Niega a tu padre y rehusa tu nombre; o, si no quieres, jura que me amas.",
      cue: "Retoma con intencion romantica.",
      duration: 6,
    },
    {
      id: "00000000-0000-4000-8000-000000000504",
      characterId: DEMO_JULIETA_ID,
      order: 4,
      text: "Solo tu nombre es mi enemigo; tu eres tu mismo, aunque no seas Montesco.",
      cue: "Mantener pausa dramatica.",
      duration: 6,
    },
    {
      id: "00000000-0000-4000-8000-000000000505",
      characterId: DEMO_ROMEO_ID,
      order: 5,
      text: "Con un nombre no se que decirte quien soy; mi nombre, santa querida, me es odioso.",
      cue: "Sube la emocion sin perder claridad.",
      duration: 6,
    },
    {
      id: "00000000-0000-4000-8000-000000000506",
      characterId: DEMO_JULIETA_ID,
      order: 6,
      text: "Mis oidos aun no han bebido cien palabras de tu boca, y ya conozco el sonido.",
      cue: "Cerrar con ternura.",
      duration: 5,
    },
  ];

export const DEMO_LINES: ScriptLineWithCharacter[] = LINES.map((line) => {
  const character = DEMO_CHARACTERS.find((item) => item.id === line.characterId) ?? null;
  return {
    id: line.id,
    scene_id: DEMO_SCENE_ID,
    character_id: line.characterId,
    line_order: line.order,
    text: line.text,
    cue: line.cue,
    duration_seconds: line.duration,
    created_at: now,
    character,
  };
});

export function getDemoScriptSetup(): ScriptSetup {
  return {
    script: DEMO_SCRIPT,
    scenes: [DEMO_SCENE],
    scene: DEMO_SCENE,
    characters: DEMO_CHARACTERS,
    lines: DEMO_LINES,
  };
}
