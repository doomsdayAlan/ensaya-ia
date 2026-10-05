import {
  evaluateSpokenLine,
  lineSimilarity,
  matchThreshold,
  normalizeSpeech,
  scoreRehearsal,
} from "./rehearsal-match.ts";

const expected =
  "De que luz se alimenta esa ventana? Es el este, y Julieta es el sol!";

const cases: Array<[string, number, string]> = [
  [expected, 0.99, "linea completa"],
  ["julieta es el sol", 0.36, "palabras clave"],
  ["ventana julieta sol", 0.28, "tres palabras clave"],
  ["de que lus se alimenta esa bentana", 0.36, "errores de pronunciacion"],
  ["hola buenos dias", 0.28, "texto no relacionado no debe pasar facil"],
];

let failed = 0;

function assert(ok: boolean, label: string, detail?: unknown) {
  if (ok) {
    console.log(`OK ${label}`);
    return;
  }
  failed += 1;
  console.error(`FAIL ${label}`, detail ?? "");
}

for (const [spoken, minScore, label] of cases) {
  const score = lineSimilarity(spoken, expected);
  const ok = label.includes("no relacionado") ? score < minScore : score >= minScore;
  assert(ok, `${label}: ${score.toFixed(3)}`);
}

assert(matchThreshold(20) === 0.28 && matchThreshold(50) === 0.36 && matchThreshold(80) === 0.48, "umbrales");
assert(normalizeSpeech("¿Hola, Julieta!") === "hola julieta", "normalizeSpeech quita puntuacion");
assert(normalizeSpeech("lluvia verde") === "yubia berde", "normalize v/b y ll/y");

const accepted = evaluateSpokenLine("julieta es el sol", expected, 50);
assert(accepted.accepted, `evaluateSpokenLine acepta palabras clave (${accepted.percent}%)`);

const rejected = evaluateSpokenLine("hola buenos dias", expected, 50);
assert(!rejected.accepted, `evaluateSpokenLine rechaza ruido (${rejected.percent}%)`);

const scored = scoreRehearsal({
  userLineScores: [0.8, 0.9],
  skipped: 1,
  repeated: 0,
  userLinesCompleted: 2,
  userLinesTotal: 2,
});
assert(scored.memorization === 85 && scored.score > 0, `scoreRehearsal ${JSON.stringify(scored)}`);

if (failed) {
  console.error(`VOICE TESTS FAILED: ${failed}`);
  process.exit(1);
}

console.log("VOICE TESTS PASSED");
process.exit(0);
