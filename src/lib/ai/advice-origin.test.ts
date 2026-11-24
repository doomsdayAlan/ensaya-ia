import { readFileSync } from "node:fs";
import { explainMissingTakes, formatAdviceLog, notesOrigin, originLabel } from "./advice-origin.ts";
import { parseInterpretationPayload, selectTakesForAnalysis } from "./interpretation.ts";
import { pipelineCharacterCast } from "./pipeline-cast.ts";

let failed = 0;

function assert(ok: boolean, label: string, detail?: unknown) {
  if (ok) {
    console.log(`OK ${label}`);
    return;
  }
  failed += 1;
  console.error(`FAIL ${label}`, detail ?? "");
}

const noKey = notesOrigin({
  provider: "gemini",
  hasKey: false,
  model: "gemini-3.5-flash-lite",
});
assert(noKey.source === "template", "sin clave usa plantilla");
assert(noKey.reason === "no hay clave en el servidor", "el motivo dice que no hay clave");
assert(
  originLabel("notas", noKey).includes("no hay clave en el servidor"),
  "la etiqueta de notas muestra el motivo",
);

const badModel = notesOrigin({
  provider: "gemini",
  hasKey: true,
  model: "gemini-2.5-flash",
  error: new Error("El modelo de lenguaje respondió 404"),
});
assert(badModel.source === "template", "modelo inválido cae al respaldo");
assert(badModel.reason === "el modelo no está disponible", "el motivo nombra el modelo");
assert(badModel.model === "gemini-2.5-flash", "el origen conserva el modelo pedido");

const gemini = notesOrigin({
  provider: "gemini",
  hasKey: true,
  model: "gemini-3.5-flash-lite",
});
assert(
  originLabel("consejos", gemini) === "Consejos generados con Gemini (gemini-3.5-flash-lite)",
  "con Gemini se nombra el modelo",
);

const none = explainMissingTakes({ considered: 0, kept: 0, short: 0, long: 0 });
assert(none === "no hubo tomas de audio válidas", "cero tomas tiene motivo");
const odd = explainMissingTakes({ considered: 2, kept: 0, short: 1, long: 1 });
assert(odd?.includes("0,3 s") === true, "tomas cortas o largas se explican");

const dropped = selectTakesForAnalysis([
  { lineId: "corta", durationSec: 0.1, byteLength: 400 },
  { lineId: "larga", durationSec: 20, byteLength: 8000 },
]);
assert(dropped.analyzed === 0, "fuera de rango no se analiza");
assert(dropped.dropReason?.includes("0,3 s") === true, `aviso de duración (${dropped.dropReason})`);

const recovered = selectTakesForAnalysis([{ lineId: "bien", durationSec: 0.1, byteLength: 8000 }]);
assert(recovered.analyzed === 1, "un reloj de 0,1 s no tira una toma con audio");

const parsed = parseInterpretationPayload(
  {
    lines: [
      {
        lineId: "l1",
        detectedExpressions: [{ name: "duda", score: 0.4 }],
        expectedEmotion: "Asombro",
        alignment: "parcial",
        tips: "Prueba una pausa antes del nombre.",
        intonation: "La frase sube al final.",
        pauses: "Falta una pausa.",
        volume: "El final se apaga.",
        rhythm: "Va parejo.",
        intention: "Suena a lectura, no a sorpresa.",
      },
    ],
  },
  new Set(["l1"]),
);
assert(
  parsed?.lines[0]?.intonation === "La frase sube al final.",
  "el parser guarda la entonación",
);
assert(parsed?.lines[0]?.intention?.includes("sorpresa") === true, "el parser guarda la intención");

const logLine = formatAdviceLog({
  route: "interpretacion",
  model: "gemini-3.5-flash-lite",
  hasKey: false,
  takes: 0,
  durationSec: 0,
  latencyMs: 12,
  result: "fallback",
  reason: "no hay clave en el servidor",
});
assert(logLine.includes("clave=no"), "el log dice clave=no");
assert(logLine.includes("resultado=fallback"), "el log dice fallback");
assert(!logLine.includes("AIza"), "el log no lleva una clave");

const first = pipelineCharacterCast("Diego (Masculino)");
assert(first.actor_type === "ai", "el pipeline no marca al primero como user");
assert(first.voice !== "Tu voz", `la voz no es la de un humano fijo (${first.voice})`);
const pipelineSource = readFileSync(new URL("./script-pipeline.ts", import.meta.url), "utf8");
assert(
  !pipelineSource.includes('actor_type: isFirst ? "user"'),
  "el ensamblaje ya no premarca user",
);
assert(
  pipelineSource.includes("pipelineCharacterCast"),
  "el ensamblaje usa el reparto de catálogo",
);

if (failed) {
  console.error(`ADVICE ORIGIN TESTS FAILED: ${failed}`);
  process.exit(1);
}
console.log("ADVICE ORIGIN TESTS PASSED");
process.exit(0);
