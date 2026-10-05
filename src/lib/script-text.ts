/**
 * Utilidades compartidas para parsear libretos importados.
 * Un solo limpiador de nombres de personaje para local-library y rehearsal-data.
 */

/** Encabezado = la linea ENTERA es ACTO/ESCENA (+ numero/romano/ordinal opcional). */
const SCENE_HEADER_ONLY_RE =
  /^(?:ACTO|ESCENA|Acto|Escena)(?:\s+(?:\d+|[IVXLCDM]+|PRIMERO|SEGUNDO|TERCERO|CUARTO|QUINTO|SEXTO|SEPTIMO|SÉPTIMO|OCTAVO|NOVENO|DECIMO|DÉCIMO|UNICO|ÚNICO|[A-ZÁÉÍÓÚÑ]{1,16}))?\s*$/i;

export function isSceneHeaderLine(line: string) {
  return SCENE_HEADER_ONLY_RE.test(line.trim());
}

/** Misma limpieza en importadores (local y remoto). */
export function cleanCharacterName(value: string) {
  return value.replace(/[:.\-–—]/g, " ").replace(/\s+/g, " ").trim();
}

export function isCharacterCue(line: string) {
  const cleaned = cleanCharacterName(line);
  if (!cleaned || cleaned.length > 40) return false;
  if (isSceneHeaderLine(cleaned)) return false;
  if (/^\d+$/.test(cleaned)) return false;
  if (/[.!?¿¡]/.test(cleaned)) return false;
  return cleaned === cleaned.toUpperCase() && /[A-ZÁÉÍÓÚÑ]/i.test(cleaned);
}
