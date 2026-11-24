import { compactHistoryDetail } from "./history-detail.ts";
import {
  catalogActorType,
  humanIdsFor,
  isProtectedSeed,
  roleLabelFor,
  rolesForSession,
  scriptDeleteDecision,
} from "./session-cast.ts";

let failed = 0;

function assert(ok: boolean, label: string, detail?: unknown) {
  if (ok) {
    console.log(`OK ${label}`);
    return;
  }
  failed += 1;
  console.error(`FAIL ${label}`, detail ?? "");
}

const SEED_ID = "00000000-0000-4000-8000-000000000101";
const romeo = "romeo";
const julieta = "julieta";
const roles = rolesForSession({ selectedCharacterId: julieta, sessionCast: null });
assert(humanIdsFor(roles).has(julieta), "solo Julieta es humana");
assert(!humanIdsFor(roles).has(romeo), "Romeo user heredado no entra");
assert(roleLabelFor(julieta, roles) === "Tú", "Julieta es Tú");
assert(roleLabelFor(romeo, roles) === "voz", "Romeo es voz");

const none = rolesForSession({ selectedCharacterId: null });
assert(none.length === 0, "sin elección no hay Tú");
assert(roleLabelFor(romeo, none) === "voz", "sin elección Romeo no es Tú");

const pair = rolesForSession({
  selectedCharacterId: julieta,
  sessionCast: [
    { characterId: julieta, actorType: "user" },
    { characterId: romeo, actorType: "actor-2" },
  ],
});
assert(roleLabelFor(romeo, pair) === "Actor 2", "Actor 2 solo si la sesión lo configuró");
assert(roleLabelFor(julieta, pair) === "Tú", "en el reparto de la sesión Julieta sigue siendo Tú");

assert(catalogActorType("user") === "ai", "el catálogo no guarda user");
assert(catalogActorType("actor-2") === "ai", "el catálogo no guarda actor-2");
assert(catalogActorType("ai") === "ai", "ai se queda ai");

assert(
  scriptDeleteDecision("local-script-1", SEED_ID) === "missing",
  "un id suelto no se trata como libreto",
);
assert(
  scriptDeleteDecision(
    { id: "local-script-1", source_type: "duplicated", user_id: "local-1" } as {
      id: string;
      source_type: string;
    },
    SEED_ID,
  ) === "ok",
  "la copia sí se puede borrar",
);
assert(
  scriptDeleteDecision({ id: SEED_ID, source_type: "seed" }, SEED_ID) === "seed",
  "el libreto semilla no se borra",
);
assert(
  isProtectedSeed({ id: "otro", source_type: "seed" }, SEED_ID),
  "source_type seed está protegido",
);

const detail = compactHistoryDetail({
  lineNotes: [
    {
      lineId: "l1",
      order: 1,
      characterName: "Julieta",
      text: "¿Romeo?",
      skipped: false,
      score: 1,
      spoken: "Romeo",
    },
  ],
  interpretation: {
    disclaimer: "Consejos orientativos.",
    notice: null,
    lines: [
      {
        lineId: "l1",
        detectedExpressions: [{ name: "duda", score: 0.4 }],
        expectedEmotion: "Asombro",
        alignment: "parcial",
        tips: "x".repeat(5000),
      },
    ],
  },
});
assert(detail.lineNotes.length === 1, "el historial guarda las líneas");
assert(detail.interpretation?.lines.length === 1, "el historial no borra el consejo");
assert((detail.interpretation?.lines[0]?.tips.length ?? 0) <= 400, "recorta el texto largo");
assert(
  detail.interpretation?.lines[0]?.detectedExpressions[0]?.name === "duda",
  "conserva la expresión",
);

if (failed) {
  console.error(`FOLLOWUP TESTS FAILED: ${failed}`);
  process.exit(1);
}
console.log("FOLLOWUP TESTS PASSED");
process.exit(0);
