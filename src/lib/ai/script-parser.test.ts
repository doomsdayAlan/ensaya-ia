import {
  calibrateSpatiallyByHeuristics,
  extractGeometricLinesFromText,
  parseGeometricScript,
  type RawPdfLine,
} from "./script-parser.ts";

let failed = 0;

function assert(ok: boolean, label: string, detail?: unknown) {
  if (ok) {
    console.log(`OK ${label}`);
    return;
  }
  failed += 1;
  console.error(`FAIL ${label}`, detail ?? "");
}

function linesOf(texts: string[]): RawPdfLine[] {
  return texts.map((text, index) => ({
    page: 1,
    y: 800 - index * 14,
    x: 72,
    text,
  }));
}

const sample = linesOf([
  "La Caperucita",
  "PRIMER ACTO - ESCENA 1",
  "MADRE",
  "(Entra con la cesta)",
  "Buenos días, hija.",
  "PRIMER ACTO - ESCENA 2",
  "MADRE",
  "Ten cuidado.",
  "SEGUNDO ACTO - ESCENA 1",
  "GENARO",
  "Hola.",
  "LUPERCIO",
  "Hola.",
  "GENARO Y LUPERCIO",
  "Vamos juntos.",
  "TODOS",
  "Gritan adiós.",
  "TERCER ACTO - ESCENA 1",
  "MADRE",
  "Fin.",
]);

const parsed = parseGeometricScript(sample, calibrateSpatiallyByHeuristics(sample));
const acts = new Set(
  parsed.scenes
    .map((scene) => scene.actTitle?.replace(/\s+/g, " ").trim().toUpperCase())
    .filter((title): title is string => Boolean(title)),
);
const dialogue = parsed.scenes.flatMap((scene) =>
  scene.lines.filter((line) => line.type === "dialogo"),
);

assert(parsed.workTitle === "La Caperucita", `titulo de la obra (${parsed.workTitle})`);
assert(acts.size === 3, `tres actos, no uno por escena (${[...acts].join(", ")})`);
assert(
  !parsed.allCharacters.some((name) => /TODOS|TODAS/.test(name)),
  `TODOS no es personaje (${parsed.allCharacters.join(", ")})`,
);
assert(
  !parsed.allCharacters.some((name) => name.includes(" Y ")),
  `compuesto no entra al elenco (${parsed.allCharacters.join(", ")})`,
);
assert(
  parsed.allCharacters.includes("MADRE") &&
    parsed.allCharacters.includes("GENARO") &&
    parsed.allCharacters.includes("LUPERCIO"),
  `elenco real (${parsed.allCharacters.join(", ")})`,
);

const madre = dialogue.find((line) => line.text.includes("Buenos días"));
assert(Boolean(madre), "primer parlamento de MADRE");
assert(Boolean(madre) && !madre!.text.includes("Entra"), "la acotacion no va pegada al parlamento");
assert(
  parsed.scenes.some((scene) =>
    scene.lines.some((line) => line.type === "acotacion" && line.text.includes("Entra")),
  ),
  "la acotacion se conserva aparte",
);

const chorus = dialogue.find((line) => line.text.includes("Gritan"));
assert(chorus?.parenthetical === "TODOS", `coro como cue (${chorus?.parenthetical})`);
assert(!chorus?.characterName, "el coro no crea hablante");

const together = dialogue.find((line) => line.text.includes("Vamos juntos"));
assert(
  together?.characterName === "GENARO",
  `A y B se queda en GENARO (${together?.characterName})`,
);
assert(
  together?.parenthetical?.includes("GENARO Y LUPERCIO") === true,
  "el compuesto queda como acotacion",
);

const columns = extractGeometricLinesFromText(
  [
    "MADRE    LOBO",
    "Buenos días.    Grrr.",
    "MADRE    ABUELA",
    "Ten cuidado.    Pasa.",
    "CAPERUCITA    LOBO",
    "Voy.    Espera.",
  ].join("\n"),
).map((line) => line.text);
const madreIndex = columns.indexOf("MADRE");
const loboIndex = columns.indexOf("LOBO");
assert(
  madreIndex >= 0 && loboIndex > madreIndex,
  `columna izquierda primero (${columns.join(" | ")})`,
);
assert(columns.includes("Buenos días."), "el primer parlamento de la izquierda no se pierde");

const cover = linesOf([
  "GUION TEATRAL",
  "“TU MENTIRA”",
  "COMISIÓN NACIONAL DE LOS DERECHOS HUMANOS",
  "OCTUBRE, 2019",
  "PRIMER ACTO - ESCENA 1",
  "MADRE",
  "Hola.",
  "PRIMER ACTO - ESCENA 2",
  "(Pausa)",
  "PRIMER ACTO - ESCENA 3",
  "MADRE",
  "Sigue.",
]);
const covered = parseGeometricScript(cover, calibrateSpatiallyByHeuristics(cover));
assert(
  covered.workTitle === "TU MENTIRA",
  `titulo de la obra, no el rotulo (${covered.workTitle})`,
);
assert(
  !covered.scenes.some((scene) => scene.title.includes("ESCENA 2")),
  `no persiste la escena vacía (${covered.scenes.map((scene) => scene.title).join(" | ")})`,
);
const follows = covered.scenes.find((scene) => scene.title.includes("ESCENA 3"));
assert(
  Boolean(follows?.lines.some((line) => line.type === "dialogo" && line.text.includes("Sigue"))),
  "el parlamento siguiente se conserva",
);
assert(
  Boolean(follows?.lines.some((line) => line.text.includes("Pausa"))),
  "la acotación de la escena vacía pasa a la siguiente",
);

if (failed) {
  console.error(`PARSER TESTS FAILED: ${failed}`);
  process.exit(1);
}

console.log("PARSER TESTS PASSED");
process.exit(0);
