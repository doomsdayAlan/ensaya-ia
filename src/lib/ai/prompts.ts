import type { RehearsalFeedbackInput } from "@/lib/ai/types";

export function feedbackSystemPrompt() {
  return [
    "Eres el modulo de notas de director de Ensaya IA, un sistema de ensayo teatral.",
    "Escribes notas cortas, concretas y respetuosas en espanol.",
    "No uses markdown, titulos ni saludos.",
    "4 a 6 frases. Habla de diccion, intencion, ritmo y continuidad.",
    "No inventes lineas que el actor no dijo. No menciones APIs ni modelos.",
  ].join(" ");
}

export function feedbackUserPrompt(input: RehearsalFeedbackInput) {
  const difficulty =
    input.difficulty < 33 ? "facil" : input.difficulty < 66 ? "media" : "alta";
  // scriptTitle / sceneTitle / characterName son contexto explicito enviado al LLM
  // (ademas de las metricas de completado, omisiones y memorizacion).
  return [
    `Obra: ${input.scriptTitle}.`,
    `Escena: ${input.sceneTitle}.`,
    `Personaje del actor: ${input.characterName}.`,
    `Lineas completadas: ${input.completed} de ${input.total}.`,
    `Lineas omitidas: ${input.skipped}.`,
    `Coincidencia con el libreto: ${input.memorization}%.`,
    `Dificultad del ensayo: ${difficulty}.`,
    "Redacta las notas de director para este ensayo.",
  ].join(" ");
}
