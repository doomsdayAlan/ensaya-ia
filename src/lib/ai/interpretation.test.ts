import {
  TERMS_VERSION,
  interpretationResult,
  parseInterpretationPayload,
  selectTakesForAnalysis,
  shouldRequestInterpretation,
} from "./interpretation.ts";

let failed = 0;

function assert(ok: boolean, label: string, detail?: unknown) {
  if (ok) {
    console.log(`OK ${label}`);
    return;
  }
  failed += 1;
  console.error(`FAIL ${label}`, detail ?? "");
}

const known = new Set(["linea-1", "linea-2"]);

const parsed = parseInterpretationPayload(
  {
    disclaimer: "",
    lines: [
      {
        lineId: "linea-1",
        detectedExpressions: [
          { name: "calma", score: 0.2 },
          { name: "enojo", score: 80 },
          { name: "miedo", score: 1.4 },
          { name: "duda", score: 0.5 },
          { name: "", score: 0.9 },
        ],
        expectedEmotion: "Tristeza",
        alignment: "parcial",
        tips: "Baja un poco el ritmo.",
      },
      { lineId: "desconocida", detectedExpressions: [], alignment: "cercano", tips: "No" },
    ],
  },
  known,
);

assert(Boolean(parsed), "json valido");
assert(parsed?.lines.length === 1, "descarta lineId desconocido");
assert(parsed?.lines[0]?.detectedExpressions.length === 3, "como mucho 3 expresiones");
assert(
  parsed?.lines[0]?.detectedExpressions[0]?.name === "miedo" &&
    parsed.lines[0].detectedExpressions[0].score === 1 &&
    parsed.lines[0].detectedExpressions.some((item) => item.name === "enojo" && item.score === 0.8),
  `puntuacion 0-1 (${parsed?.lines[0]?.detectedExpressions.map((item) => item.score).join(",")})`,
);
assert(
  !parsed?.lines[0]?.detectedExpressions.some((item) => item.score > 1),
  "ninguna puntuacion fuera de 0-1",
);
assert(parsed?.disclaimer.includes("orientativos") === true, "descargo por omision");
assert(
  parseInterpretationPayload({ ok: true }, known) === null,
  "json invalido no inventa consejos",
);
assert(parseInterpretationPayload("no-json", known) === null, "texto suelto no inventa consejos");

const selection = selectTakesForAnalysis([
  { lineId: "a", durationSec: 0.1, byteLength: 1000 },
  { lineId: "b", durationSec: 20, byteLength: 1000 },
  ...Array.from({ length: 22 }, (_, index) => ({
    lineId: `l${index}`,
    durationSec: 10,
    byteLength: 1000,
  })),
]);
assert(selection.analyzed === 18, `tope de tomas y de 3 minutos (${selection.analyzed})`);
assert(
  selection.notice?.includes("Se analizaron") === true,
  `aviso de recorte (${selection.notice})`,
);

assert(
  shouldRequestInterpretation({
    mode: "individual",
    termsAccepted: true,
    audioEnabled: true,
    offline: false,
    hasTakes: true,
  }),
  "con terminos y tomas se pide analisis",
);
assert(
  !shouldRequestInterpretation({
    mode: "individual",
    termsAccepted: false,
    audioEnabled: true,
    offline: false,
    hasTakes: true,
  }),
  "sin terminos no se llama",
);
assert(
  !shouldRequestInterpretation({
    mode: "individual",
    termsAccepted: true,
    audioEnabled: false,
    offline: false,
    hasTakes: true,
  }),
  "interruptor apagado no se llama",
);
assert(
  !shouldRequestInterpretation({
    mode: "lectura",
    termsAccepted: true,
    audioEnabled: true,
    offline: false,
    hasTakes: true,
  }),
  "lectura no envia audio",
);
assert(
  !shouldRequestInterpretation({
    mode: "individual",
    termsAccepted: true,
    audioEnabled: true,
    offline: true,
    hasTakes: true,
  }),
  "sin conexion no envia audio",
);
const fallback = interpretationResult(null, "No hubo consejos de interpretación.");
assert(fallback?.lines.length === 0, "sin clave o JSON invalido no inventa lineas");
assert(
  !fallback?.lines.some((line) => line.detectedExpressions.length > 0),
  "el aviso no trae expresiones inventadas",
);
assert(TERMS_VERSION.length > 0, "hay version de terminos");

if (failed) {
  console.error(`INTERPRETATION TESTS FAILED: ${failed}`);
  process.exit(1);
}

console.log("INTERPRETATION TESTS PASSED");
process.exit(0);
