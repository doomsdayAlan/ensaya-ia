/* eslint-disable no-useless-escape */
/**
 * script-parser.ts
 * Parser Espacial (Geométrico) + Detección Multi-Columna + Rectificación de Personajes con TinyLLM.
 *
 * Resuelve los desafíos críticos en libretos:
 * 1. Documentos en DOS COLUMNAS (PDF y Texto):
 *    Detecta automáticamente si cada página o bloque de texto está organizado en 1 o 2 columnas.
 *    Desentrelaza las columnas procesando primero toda la columna izquierda (top-to-bottom)
 *    y luego la columna derecha (top-to-bottom), evitando que líneas o personajes enfrentados
 *    horizontalmente se unan en una sola línea errónea.
 * 2. Rectificación de Personajes Quiméricos y Repetidos:
 *    Detecta listas explícitas de "Personajes:" / "Reparto:" en cualquier sección del documento
 *    y descarta nombres compuestos erróneos (ej. "Narrador Lobo", "Lobo Abuelita", "Caperucita Lobo", "Cerdito Lobo"),
 *    unificando sinónimos teatrales y diminutivos (ej. "Abuela" <-> "Abuelita", "Mamá" <-> "Madre", "Peter" <-> "Peter Pan").
 * 3. Segmentación Dinámica de Escenas:
 *    Identifica cambios de escena por títulos de obra, "Guión:", actos ("Acto I"), escenas ("Escena 1"),
 *    y encabezados cinematográficos ("INT.", "EXT.").
 */

import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";
import { getOllamaUrl, getTeleprompterUrl } from "./optional-services";

// ─── 1. Esquema estricto para forzar al TinyLLM (Structured Output) ───────────

export const ScriptRulesSchema = z.object({
  formatoDetectado: z
    .enum(["cine_estandar", "teatro_hispano", "mixto"])
    .describe("Formato de maquetación del libreto detectado"),
  xMinPersonaje: z
    .number()
    .describe("Coordenada X aproximada donde inician los nombres de personajes centrados"),
  xMinDialogo: z.number().describe("Coordenada X aproximada donde inicia el bloque de diálogo"),
  usaPrefijoEnLinea: z
    .boolean()
    .describe(
      "True si el personaje va en la misma línea que el diálogo (ej. JUAN.- Hola o JUAN: Hola)",
    ),
  aliasPersonajes: z
    .record(z.string(), z.string())
    .describe(
      'Mapa de variantes de nombres a nombre canónico, ej. {"GUARDIA 1": "GUARDIA", "D. JUAN": "DON JUAN"}',
    ),
});

export type ScriptRules = z.infer<typeof ScriptRulesSchema>;

export interface RawPdfLine {
  page: number;
  y: number;
  x: number;
  text: string;
}

export interface ParsedGeometricLine {
  id: string;
  type: "encabezado_acto" | "encabezado_escena" | "personaje" | "acotacion" | "dialogo";
  characterName?: string;
  parenthetical?: string;
  text: string;
  page: number;
  x: number;
  y: number;
}

export interface ParsedGeometricScene {
  id: string;
  title: string;
  actTitle?: string;
  description?: string;
  lines: ParsedGeometricLine[];
  characters: string[];
}

export interface GeometricScriptResult {
  rules: ScriptRules;
  scenes: ParsedGeometricScene[];
  allCharacters: string[];
  totalLines: number;
  usedOllamaOrBackend: boolean;
  /** Primera línea significativa, si no es un encabezado de escena. */
  workTitle?: string | null;
}

interface PdfFragment {
  x: number;
  y: number;
  width: number;
  text: string;
}

// Lista de palabras o títulos que no representan personajes hablantes
const STAGE_BLACKLIST = new Set([
  "ACTO",
  "ESCENA",
  "CUADRO",
  "JORNADA",
  "PRÓLOGO",
  "PROLOGO",
  "EPÍLOGO",
  "EPILOGO",
  "TELÓN",
  "TELON",
  "OSCURO",
  "APAGÓN",
  "APAGON",
  "MUTACIÓN",
  "MUTACION",
  "FIN",
  "THE END",
  "FIN DEL ACTO",
  "CONTINÚA",
  "CONTINUA",
  "CONTINUED",
  "CORTE A",
  "FADE IN",
  "FADE OUT",
  "PAUSA",
  "SILENCIO",
  "TRANSICIÓN",
  "TRANSICION",
  "PERSONAJES",
  "REPARTO",
  "DRAMATIS PERSONAE",
  "ELENCO",
  "ACTORES",
  "PERSONAJES QUE INTERVIENEN",
  "GUIÓN",
  "GUION",
  "VER TAMBIÉN",
  "VER TAMBIEN",
  "TÍTULO",
  "TITULO",
  "AUTOR",
  "ADAPTACIÓN",
  "ADAPTACION",
  "ESCENOGRAFÍA",
  "ESCENOGRAFIA",
  "VESTUARIO",
  "OBRAS DE TEATRO",
  "REPRESENTAR CON LOS NIÑOS",
  "MÁS OBRAS DE TEATRO",
  "MÁS OBRAS",
  "DESCRIPCIÓN",
  "DESCRIPCION",
  "NOTAS DEL DIRECTOR",
  "INTRODUCCIÓN",
  "INTRODUCCION",
  "INTENCIÓN DRAMÁTICA",
  "INTENCION DRAMATICA",
  "ELEMENTOS TEATRALES",
  "ELEMENTOS ESCÉNICOS",
  "ELEMENTOS ESCENICOS",
  "ELEMENTOS DE LA ESCENA",
  "ELEMENTOS ESCENOGRÁFICOS",
  "ELEMENTOS ESCENOGRAFICOS",
  "ELEMENTOS DRAMÁTICOS",
  "ELEMENTOS DRAMATICOS",
  "ELEMENTO DRAMÁTICO",
  "ELEMENTO DRAMATICO",
  "OBJETIVO DRAMÁTICO",
  "OBJETIVO DRAMATICO",
  "OBJETIVO",
  "TRAZO ESCÉNICO",
  "TRAZO ESCENICO",
  "HÁGANSE PREGUNTAS",
  "HAGANSE PREGUNTAS",
  "AUDIO",
  "AUDIO DE FIESTA",
  "AUDIO DE FIESTA QUEDA",
  "ILUMINACIÓN",
  "ILUMINACION",
  "AMBIENTACIÓN",
  "AMBIENTACION",
  "PRIMERA EDICIÓN",
  "PRIMERA EDICION",
  "OCTUBRE, 2019",
  "EDICIÓN",
  "EDICION",
  "TU MENTIRA",
  "“TU MENTIRA”",
  '"TU MENTIRA"',
  "COMISIÓN NACIONAL DE LOS DERECHOS HUMANOS",
  "COMISION NACIONAL DE LOS DERECHOS HUMANOS",
  "CONSIDERACIONES",
  "CONSIDERACIONES PARA MONTAR ESTA OBRA DE TEATRO",
  "CONTENIDO",
  "ANEXO",
  "CONCLUSIÓN",
  "CONCLUSION",
  "BUENA SUERTE",
  "PD",
  "P.D.",
  "P.D",
  "POSTDATA",
  "POST DATA",
  "NOTA FINAL",
  "CONVENTO",
  "CALATRAVA",
]);

// Prefijos de notas escénicas, intenciones dramáticas y dirección técnica
const SCENE_NOTE_PREFIX_RE =
  /^(?:INTENCI[OÓ]N\s+DRAM[AÁ]TICA|ELEMENTOS\s+TEATRALES|ELEMENTOS\s+ESC[EÉ]NICOS|ELEMENTOS\s+DE\s+LA\s+ESCENA|ELEMENTOS\s+ESCENOGR[AÁ]FICOS|ELEMENTOS\s+DRAM[AÁ]TICOS|ELEMENTO\s+DRAM[AÁ]TICO|OBJETIVO(?:\s+DRAM[AÁ]TICO)?|TRAZO\s+ESC[EÉ]NICO|H[AÁ]GANSE\s+PREGUNTAS|AUDIO(?:\s+DE\s+FIESTA(?:\s+QUEDA)?)?|ESCENOGRAF[IÍ]A|VESTUARIO|ILUMINACI[OÓ]N|AMBIENTACI[OÓ]N|ATM[OÓ]SFERA|NOTA(?:\s+DEL\s+DIRECTOR)?|NOTAS|SINOPSIS|CONSIDERACIONES)(?:\s*:|\s*\.-|\s*–|\s*—|\s*-|\s*$)/i;

// Encabezados de página y metadatos de publicación institucional o editorial
const METADATA_OR_HEADER_RE =
  /^(?:GUION\s+TEATRAL|GUIÓN\s+TEATRAL|PRIMERA\s+EDICI[OÓ]N|COMISI[OÓ]N\s+NACIONAL\s+DE\s+LOS\s+DERECHOS\s+HUMANOS|MTRO\.\s+LUIS\s+RA[UÚ]L|DERECHOS\s+RESERVADOS|ISBN\b|COPYRIGHT|\(?C\)?\s*\d{4}|P[AÁ]GINA\s+\d+|\d+\s+(?:GUION|GUIÓN|COMISI[OÓ]N|PRIMERA)|(?:GUION|GUIÓN|“?TU\s+MENTIRA”?)\s+\d+|\d+\s*Comisión|\d+\s*Guion|Quinta\s+Visitaduría|Programa\s+contra\s+la\s+Trata|D\.\s*R\.\s*©)/i;

// Acciones escénicas no parentéticas (movimientos de actores, entradas, salidas, cambios escenográficos)
const STAGE_ACTION_START_RE =
  /^(?:Mientras|Entra|Entran|Sale|Salen|Se sienta|Se levanta|Vase|Vanse|Cae el telón|Baja el telón|Bambalinas|Oscuro|Apagón|Mutación|Pausa|Silencio)\b/i;

// Encabezados de localización / ambientación escénica (ej. "En el panteón.", "En la taberna.")
const LOCATION_HEADING_RE =
  /^(?:En\s+(?:el|la|un|una)\s+[A-Za-zÁÉÍÓÚÑÜáéíóúñü\s]{3,30}[\.\s]*$|Interior[\.\s]|Exterior[\.\s])/i;

// Divisores decorativos entre escenas (ej. ".-.-.-.-.-.-.-.-.-.-", "***", "---")
const DIVIDER_RE = /^(?:[.\-_*~=—–\s]{4,}|(?:\.-)+)$/;

// ─── 2. Detección Inteligente de Columnas (Medianil / Gutter) ─────────────────

/**
 * Detecta si una página de PDF está maquetada en 2 columnas analizando la distribución
 * horizontal de los fragmentos y ubicando la franja vertical libre (medianil / gutter).
 */
function detectTwoColumnGutter(fragments: PdfFragment[], pageWidth: number): number | null {
  if (fragments.length < 10) return null;

  // Ignorar fragmentos excesivamente anchos (títulos principales o acotaciones panorámicas)
  const contentFrags = fragments.filter((f) => f.width < pageWidth * 0.65);
  if (contentFrags.length < 8) return null;

  // Franja central donde comúnmente se ubica el medianil (30% a 70% del ancho)
  const minSplit = pageWidth * 0.3;
  const maxSplit = pageWidth * 0.7;

  let bestSplitX: number | null = null;
  let maxGutterWidth = 0;

  for (let splitX = minSplit; splitX <= maxSplit; splitX += 5) {
    let leftCount = 0;
    let rightCount = 0;
    let straddlingCount = 0;

    let closestLeftEdge = 0;
    let closestRightEdge = pageWidth;

    for (const f of contentFrags) {
      const fRight = f.x + (f.width > 0 ? f.width : f.text.length * 6);
      if (fRight < splitX) {
        leftCount++;
        if (fRight > closestLeftEdge) closestLeftEdge = fRight;
      } else if (f.x > splitX) {
        rightCount++;
        if (f.x < closestRightEdge) closestRightEdge = f.x;
      } else {
        straddlingCount++;
      }
    }

    const gutterWidth = closestRightEdge - closestLeftEdge;
    const maxAllowedStraddling = Math.max(1, Math.floor(contentFrags.length * 0.05));

    // Criterio de dos columnas:
    // - Al menos 4 fragmentos tanto a la izquierda como a la derecha
    // - Máximo 5% de fragmentos cruzando la frontera
    // - Separación real en blanco de al menos 12pt
    if (
      leftCount >= 4 &&
      rightCount >= 4 &&
      straddlingCount <= maxAllowedStraddling &&
      gutterWidth >= 12
    ) {
      if (gutterWidth > maxGutterWidth) {
        maxGutterWidth = gutterWidth;
        bestSplitX = Math.round((closestLeftEdge + closestRightEdge) / 2);
      }
    }
  }

  return bestSplitX;
}

/**
 * Agrupa fragmentos de una sola columna horizontalmente (misma Y con tolerancia de 2.5pt)
 * y los ordena de arriba hacia abajo (Y descendente) y de izquierda a derecha (X ascendente).
 */
function groupFragmentsIntoLines(items: PdfFragment[], pageNum: number): RawPdfLine[] {
  const rowMap = new Map<number, { x: number; text: string }[]>();

  for (const item of items) {
    let matchedY = Array.from(rowMap.keys()).find((key) => Math.abs(key - item.y) <= 2.5);
    if (matchedY === undefined) {
      matchedY = item.y;
      rowMap.set(matchedY, []);
    }
    rowMap.get(matchedY)!.push({ x: item.x, text: item.text });
  }

  const sortedYs = Array.from(rowMap.keys()).sort((a, b) => b - a);
  const result: RawPdfLine[] = [];

  for (const y of sortedYs) {
    const frags = rowMap.get(y)!.sort((a, b) => a.x - b.x);
    const rowText = frags
      .map((f) => f.text)
      .join(" ")
      .trim();
    if (!rowText) continue;

    result.push({
      page: pageNum,
      y,
      x: frags[0].x,
      text: rowText,
    });
  }

  return result;
}

// ─── 3. Lector Geométrico de PDF con Desentrelazado de Columnas ───────────────

export async function extractGeometricLines(pdfBuffer: Uint8Array): Promise<RawPdfLine[]> {
  const pdfjsLib = await import("pdfjs-dist");

  if (typeof window !== "undefined" && !pdfjsLib.GlobalWorkerOptions.workerSrc) {
    try {
      pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
        "pdfjs-dist/build/pdf.worker.min.mjs",
        import.meta.url,
      ).toString();
    } catch {
      // Worker fallback
    }
  }

  const loadingTask = pdfjsLib.getDocument({ data: pdfBuffer });
  const pdfDoc = await loadingTask.promise;
  const lines: RawPdfLine[] = [];

  for (let pageNum = 1; pageNum <= pdfDoc.numPages; pageNum++) {
    const page = await pdfDoc.getPage(pageNum);
    const content = await page.getTextContent();
    const viewport = page.getViewport({ scale: 1.0 });
    const pageWidth = viewport.width || 595;

    // Extraer fragmentos no vacíos
    const fragments: PdfFragment[] = [];
    for (const item of content.items) {
      if (!("str" in item) || !item.str.trim()) continue;
      const x = Math.round(item.transform[4]);
      const y = Math.round(item.transform[5]);
      const width = Math.round(item.width || item.str.length * 6);
      fragments.push({ x, y, width, text: item.str });
    }

    if (fragments.length === 0) continue;

    // Detectar si esta página específica está organizada en 2 columnas
    const gutterX = detectTwoColumnGutter(fragments, pageWidth);

    if (gutterX !== null) {
      // PÁGINA EN DOS COLUMNAS:
      // Identificar si existen fragmentos superiores que crucen toda la página antes de que inicien las columnas
      const straddlingWide = fragments.filter(
        (f) => f.x < gutterX && f.x + f.width > gutterX && f.width >= 35,
      );
      const normalFrags = fragments.filter(
        (f) => !(f.x < gutterX && f.x + f.width > gutterX && f.width >= 35),
      );

      const leftItems = normalFrags.filter((f) => f.x + f.width / 2 < gutterX);
      const rightItems = normalFrags.filter((f) => f.x + f.width / 2 >= gutterX);

      // Determinar la cota superior donde inician las dos columnas
      const leftTopY = leftItems.length > 0 ? Math.max(...leftItems.map((f) => f.y)) : 0;
      const rightTopY = rightItems.length > 0 ? Math.max(...rightItems.map((f) => f.y)) : 0;
      const maxColY = Math.max(leftTopY, rightTopY);

      // Encabezados superiores (títulos o acotaciones que abarcan ambas columnas en la parte superior)
      // Solo el título que cruza el canal y está por encima de las columnas.
      // El primer bloque de la columna izquierda (p. ej. MADRE) no es encabezado.
      const headerFragments = [
        ...straddlingWide.filter((f) => f.y > maxColY + 8 && f.width >= pageWidth * 0.45),
        ...normalFrags.filter((f) => f.y > maxColY + 18 && f.width >= pageWidth * 0.45),
      ];

      const leftColumnFragments = leftItems.filter((f) => !headerFragments.includes(f));
      const rightColumnFragments = rightItems.filter((f) => !headerFragments.includes(f));

      const headerLines = groupFragmentsIntoLines(headerFragments, pageNum);
      const leftLines = groupFragmentsIntoLines(leftColumnFragments, pageNum);
      const rightLines = groupFragmentsIntoLines(rightColumnFragments, pageNum);

      // Flujo de lectura natural: Primero encabezado general, luego Columna 1 completa, luego Columna 2 completa
      lines.push(...headerLines, ...leftLines, ...rightLines);
    } else {
      // PÁGINA EN UNA SOLA COLUMNA:
      const singleLines = groupFragmentsIntoLines(fragments, pageNum);
      lines.push(...singleLines);
    }
  }

  return lines;
}

/**
 * Convierte texto plano o Markdown a líneas geométricas virtuales.
 * Si detecta que el archivo de texto fue formateado con 2 columnas lado a lado
 * (separadas por múltiples espacios o tabulaciones), las desentrelaza automáticamente.
 */
export function extractGeometricLinesFromText(rawText: string): RawPdfLine[] {
  const rawLines = rawText.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");

  // Detectar si el texto tiene formato de 2 columnas lado a lado (separadas por 4+ espacios o tabulador)
  const sideBySideRe = /^([^\t]+?)(?:\t+|\s{4,})([^\t]+)$/;
  let sideBySideCount = 0;

  for (const line of rawLines.slice(0, 80)) {
    const m = line.match(sideBySideRe);
    if (m && m[1].trim() && m[2].trim()) {
      sideBySideCount++;
    }
  }

  const isTwoColumnText = sideBySideCount >= 5;
  const lines: RawPdfLine[] = [];

  if (isTwoColumnText) {
    const leftTextLines: string[] = [];
    const rightTextLines: string[] = [];

    for (const raw of rawLines) {
      const match = raw.match(sideBySideRe);
      if (match && match[1].trim() && match[2].trim()) {
        leftTextLines.push(match[1].trim());
        rightTextLines.push(match[2].trim());
      } else {
        if (raw.trim()) leftTextLines.push(raw.trim());
      }
    }

    let virtualY = (leftTextLines.length + rightTextLines.length) * 15;
    for (const t of leftTextLines) {
      virtualY -= 15;
      lines.push({ page: 1, y: virtualY, x: 60, text: t });
    }
    for (const t of rightTextLines) {
      virtualY -= 15;
      lines.push({ page: 2, y: virtualY, x: 60, text: t });
    }
    return lines;
  }

  // Texto estándar en 1 columna secuencial
  let virtualY = rawLines.length * 15;
  for (let i = 0; i < rawLines.length; i++) {
    const line = rawLines[i];
    virtualY -= 15;
    if (!line.trim()) continue;

    const leadingSpaces = line.search(/\S|$/);
    const text = line.trim();
    const virtualX = 50 + leadingSpaces * 10;

    lines.push({
      page: Math.floor(i / 55) + 1,
      y: virtualY,
      x: virtualX,
      text,
    });
  }

  return lines;
}

// ─── 4. Extracción de Reparto Explícito y Rectificación de Personajes ─────────

/**
 * Busca y extrae la lista canónica de personajes en cualquier sección del libreto
 * donde aparezca "Personajes:", "Reparto:", "Dramatis Personae:", "Elenco:", etc.
 */
export function extractExplicitCastList(lines: RawPdfLine[]): Set<string> {
  const cast = new Set<string>();
  let inCastSection = false;

  const headerRe =
    /^(?:PERSONAJES|REPARTO|DRAMATIS PERSONAE|ELENCO|ACTORES|PERSONAJES QUE INTERVIENEN)(?:\s*\([^)]+\))?[:\s]*$/i;
  const endSectionRe =
    /^(?:GUIÓN|GUION|ACTO|ESCENA|CUADRO|INICIO|PRIMER ACTO|SEGUNDO ACTO|TERCER ACTO|OBRA|DESCRIPCIÓN|PRÓLOGO|PROLOGO|CONTENIDO|CONSIDERACIONES)[:\s]*$/i;

  for (let i = 0; i < lines.length; i++) {
    const text = lines[i].text.trim();

    if (headerRe.test(text)) {
      inCastSection = true;
      continue;
    }

    if (inCastSection) {
      if (
        endSectionRe.test(text) ||
        (text === text.toUpperCase() && text.length > 40) ||
        /^[A-ZÁÉÍÓÚÑÜ0-9\s]{2,25}:\s*\S/.test(text) ||
        STAGE_ACTION_START_RE.test(text) ||
        DIVIDER_RE.test(text) ||
        (LOCATION_HEADING_RE.test(text) && text.length <= 40)
      ) {
        inCastSection = false;
        continue;
      }

      // Limpiar viñetas especiales (●, •, ○, ■, ▪, *, -, +), numeración (1., 2.), acotaciones "(enferma)"
      let clean = text
        .replace(/^[\u2022\u25cf\u25cb\u25a0\u25aa\u2043\u2219\u00b7\-\*\+\d\.\s–—]+/, "")
        .replace(/\([^)]+\)/g, "")
        .trim();

      // Si la línea tiene formato "Personaje [descripción] – Actor" (ej. "Don Juan Tenorio – Belén", "Enterrador – Efraín")
      clean = clean.replace(/\s*[\-–—:]\s*[A-Za-zÁÉÍÓÚÑÜáéíóúñü0-9\.\s]+$/, "").trim();

      // Quitar descripción de rol tras coma (ej. "Butarelli, hostelero" -> "Butarelli")
      if (clean.includes(",")) {
        const beforeComma = clean.split(",")[0].trim();
        if (beforeComma.length >= 2 && beforeComma.length <= 30) {
          clean = beforeComma;
        }
      }

      clean = clean
        .replace(/[:\.\-–—]+.*$/, "")
        .trim()
        .toUpperCase();

      if (clean && clean.length >= 2 && clean.length <= 35 && !STAGE_BLACKLIST.has(clean)) {
        let norm = clean;
        if (norm === "DON JUAN TENORIO") norm = "DON JUAN";
        if (norm === "DON LUIS MEJÍA") norm = "DON LUIS";
        if (norm === "MARCOS CIUTTI") norm = "CIUTTI";
        if (norm === "DOÑA INÉS DE ULLOA" || norm === "INÉS") norm = "DOÑA INÉS";
        if (norm === "DON GONZALO DE ULLOA") norm = "COMENDADOR";
        if (norm === "ABUELITA") norm = "ABUELA";
        if (norm === "MAMÁ" || norm === "MAMA") norm = "MADRE";
        if (norm === "PAPÁ" || norm === "PAPA") norm = "PADRE";
        if (norm === "PETER") norm = "PETER PAN";
        cast.add(norm);
      }
    }
  }

  return cast;
}

/**
 * Normaliza y rectifica nombres de personajes, resolviendo combinaciones quiméricas
 * (ej. "NARRADOR LOBO", "LOBO ABUELITA", "CAPERUCITA LOBO", "CERDITO MEDIANO LOBO")
 * y unificando sinónimos comunes en español (Abuela <-> Abuelita, Mamá <-> Madre, Peter <-> Peter Pan).
 */
export function rectifyCharacterCandidate(
  candidate: string,
  canonicalCast: Set<string>,
  knownCharacters: Set<string>,
): { rectifiedName: string; isChimera: boolean; secondName?: string } {
  let name = candidate
    .replace(/\((?:V\.?O\.?|O\.?S\.?|OFF|CONT'?D|VOZ|EN OFF|APARTE)\)/gi, "")
    .replace(/[:\.\-—–]+$/, "")
    .trim()
    .toUpperCase();

  // 1. Quitar artículos iniciales ("EL LOBO" -> "LOBO", "LA ABUELITA" -> "ABUELA")
  name = name.replace(/^(?:EL|LA|LOS|LAS)\s+/i, "");

  // 2. Normalización de sinónimos, alias teatrales y diminutivos en español
  if (name === "ABUELITA" || name === "LA ABUELITA" || name === "ABUELA") {
    name = "ABUELA";
  } else if (name === "MAMÁ" || name === "MAMA" || name === "MADRE") {
    name = "MADRE";
  } else if (name === "PAPÁ" || name === "PAPA" || name === "PADRE") {
    name = "PADRE";
  } else if (name === "PETER") {
    name =
      canonicalCast.has("PETER PAN") || knownCharacters.has("PETER PAN") ? "PETER PAN" : "PETER";
  } else if (name === "DON JUAN TENORIO") {
    name = "DON JUAN";
  } else if (name === "DON LUIS MEJÍA" || name === "DON LUIS MEJIA") {
    name = "DON LUIS";
  } else if (name === "MARCOS CIUTTI") {
    name = "CIUTTI";
  } else if (
    name === "DOÑA INÉS DE ULLOA" ||
    name === "DONA INES DE ULLOA" ||
    name === "INÉS" ||
    name === "INES"
  ) {
    name = "DOÑA INÉS";
  } else if (name === "DON GONZALO DE ULLOA" || name === "DON GONZALO") {
    name = "COMENDADOR";
  }

  // Si coincide exactamente con el reparto canónico o ya conocido
  if (canonicalCast.has(name) || knownCharacters.has(name)) {
    return { rectifiedName: name, isChimera: false };
  }

  // 3. Detección Avanzada de QUIMERAS (ej. "NARRADOR LOBO", "CAPERUCITA LOBO", "LOBO ABUELITA")
  const pool = new Set([...canonicalCast, ...knownCharacters]);
  pool.add("ABUELITA");
  pool.add("ABUELA");
  pool.add("MADRE");
  pool.add("MAMÁ");
  pool.add("LOBO");
  pool.add("NARRADOR");
  pool.add("CAPERUCITA");
  pool.add("PETER");
  pool.add("PETER PAN");

  const words = name.split(/\s+/);

  if (words.length >= 2) {
    // Probar si el nombre está formado por dos personajes conocidos
    for (let i = 1; i < words.length; i++) {
      const part1 = words.slice(0, i).join(" ");
      const part2 = words.slice(i).join(" ");

      const norm1 = part1 === "ABUELITA" ? "ABUELA" : part1 === "PETER" ? "PETER PAN" : part1;
      const norm2 = part2 === "ABUELITA" ? "ABUELA" : part2 === "PETER" ? "PETER PAN" : part2;

      const p1Matches = pool.has(part1) || pool.has(norm1);
      const p2Matches = pool.has(part2) || pool.has(norm2);

      if (p1Matches && p2Matches) {
        // ¡Confirmado Quimera! Descartamos la unión y nos quedamos con el primer personaje real
        return { rectifiedName: norm1, isChimera: true, secondName: norm2 };
      }
    }
  }

  return { rectifiedName: name, isChimera: false };
}

// ─── 5. Calibración con el TinyLLM (Ollama, FastAPI o Heurística Espacial) ─────

export async function calibrateScriptWithTinyLLM(
  sampleLines: RawPdfLine[],
  ollamaUrl?: string,
  teleprompterUrl?: string,
): Promise<{ rules: ScriptRules; source: "ollama" | "fastapi" | "spatial_heuristic" }> {
  const sample = sampleLines.slice(0, 80);
  const sampleText = sample.map((l) => `[X=${l.x}] ${l.text}`).join("\n");
  const ollamaBase = (ollamaUrl?.trim() || getOllamaUrl() || "").replace(/\/$/, "");
  const teleprompterBase = (teleprompterUrl?.trim() || getTeleprompterUrl() || "").replace(
    /\/$/,
    "",
  );

  // 1. Ollama solo si VITE_OLLAMA_URL está definida
  if (ollamaBase) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 2000);
      const res = await fetch(`${ollamaBase}/api/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "qwen2.5:1.5b",
          prompt: `Analiza estas líneas de un libreto teatral o cinematográfico con su sangría X y extrae sus reglas de formato:\n\n${sampleText}`,
          stream: false,
          format: zodToJsonSchema(ScriptRulesSchema),
          options: { temperature: 0.0 },
        }),
        signal: controller.signal,
      });
      clearTimeout(timeout);

      if (res.ok) {
        const data = await res.json();
        const parsed = ScriptRulesSchema.parse(JSON.parse(data.response));
        return { rules: parsed, source: "ollama" };
      }
    } catch {
      // Continuar
    }
  }

  // 2. FastAPI solo si VITE_TELEPROMPTER_URL (o compat) está definida
  if (teleprompterBase) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 2000);
      const res = await fetch(`${teleprompterBase}/characters/calibrate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sample_text: sampleText }),
        signal: controller.signal,
      });
      clearTimeout(timeout);

      if (res.ok) {
        const data = await res.json();
        const parsed = ScriptRulesSchema.parse(data);
        return { rules: parsed, source: "fastapi" };
      }
    } catch {
      // Continuar al fallback espacial
    }
  }

  // 3. Fallback espacial determinista en el navegador (sin fetch)
  const rules = calibrateSpatiallyByHeuristics(sampleLines);
  return { rules, source: "spatial_heuristic" };
}

export function calibrateSpatiallyByHeuristics(lines: RawPdfLine[]): ScriptRules {
  let hasInlinePrefixCount = 0;
  const xValues: number[] = [];
  const candidateNames: Record<string, number> = {};

  const inlinePrefixRe =
    /^([A-ZÁÉÍÓÚÑÜ][a-záéíóúñüA-ZÁÉÍÓÚÑÜ0-9\s\.\-—]{1,30}?)(?:\s*\([^)]+\))?\s*(?::|\.-|[–—]|\s+-\s+)\s*(.+)$/;
  const standaloneCueRe = /^([A-ZÁÉÍÓÚÑÜ][A-ZÁÉÍÓÚÑÜ0-9\s\.\-]{1,30}?)(?:\s*\([^)]+\))?$/;

  const explicitCast = extractExplicitCastList(lines);

  for (const line of lines.slice(0, 150)) {
    xValues.push(line.x);

    if (inlinePrefixRe.test(line.text)) {
      hasInlinePrefixCount++;
      const m = line.text.match(inlinePrefixRe);
      if (m) {
        const clean = m[1].trim().toUpperCase();
        if (!STAGE_BLACKLIST.has(clean)) {
          candidateNames[clean] = (candidateNames[clean] || 0) + 1;
        }
      }
    } else if (line.text === line.text.toUpperCase() && line.text.length <= 35) {
      const m = line.text.match(standaloneCueRe);
      if (m) {
        const clean = m[1].trim().toUpperCase();
        if (!STAGE_BLACKLIST.has(clean)) {
          candidateNames[clean] = (candidateNames[clean] || 0) + 1;
        }
      }
    }
  }

  const usaPrefijoEnLinea = hasInlinePrefixCount >= 3;
  const formatoDetectado = usaPrefijoEnLinea ? "teatro_hispano" : "cine_estandar";

  xValues.sort((a, b) => a - b);
  const minX = xValues[0] ?? 50;
  const maxX = xValues[xValues.length - 1] ?? 500;

  const xMinDialogo = Math.round(minX + (maxX - minX) * 0.25);
  const xMinPersonaje = Math.round(minX + (maxX - minX) * 0.45);

  const aliasPersonajes: Record<string, string> = {};

  // Registrar personajes del reparto explícito
  for (const c of explicitCast) {
    aliasPersonajes[c] = c;
    if (c === "ABUELA") aliasPersonajes["ABUELITA"] = "ABUELA";
    if (c === "MADRE") aliasPersonajes["MAMÁ"] = "MADRE";
    if (c === "PADRE") aliasPersonajes["PAPÁ"] = "PADRE";
    if (c === "PETER PAN") aliasPersonajes["PETER"] = "PETER PAN";
    if (c === "DON JUAN" || c === "DON JUAN TENORIO") {
      aliasPersonajes["DON JUAN TENORIO"] = "DON JUAN";
      aliasPersonajes["DON JUAN"] = "DON JUAN";
    }
    if (c === "DON LUIS" || c === "DON LUIS MEJÍA") {
      aliasPersonajes["DON LUIS MEJÍA"] = "DON LUIS";
      aliasPersonajes["DON LUIS"] = "DON LUIS";
    }
    if (c === "CIUTTI" || c === "MARCOS CIUTTI") {
      aliasPersonajes["MARCOS CIUTTI"] = "CIUTTI";
      aliasPersonajes["CIUTTI"] = "CIUTTI";
    }
    if (c === "DOÑA INÉS" || c === "DOÑA INÉS DE ULLOA" || c === "INÉS") {
      aliasPersonajes["DOÑA INÉS DE ULLOA"] = "DOÑA INÉS";
      aliasPersonajes["INÉS"] = "DOÑA INÉS";
      aliasPersonajes["DOÑA INÉS"] = "DOÑA INÉS";
    }
    if (c === "COMENDADOR" || c === "DON GONZALO DE ULLOA") {
      aliasPersonajes["DON GONZALO DE ULLOA"] = "COMENDADOR";
      aliasPersonajes["DON GONZALO"] = "COMENDADOR";
      aliasPersonajes["COMENDADOR"] = "COMENDADOR";
    }
    aliasPersonajes[`EL ${c}`] = c;
    aliasPersonajes[`LA ${c}`] = c;
  }

  for (const name of Object.keys(candidateNames)) {
    if (!aliasPersonajes[name]) {
      aliasPersonajes[name] = name;
    }
  }

  return {
    formatoDetectado,
    xMinPersonaje: usaPrefijoEnLinea ? minX : xMinPersonaje,
    xMinDialogo: usaPrefijoEnLinea ? minX : xMinDialogo,
    usaPrefijoEnLinea,
    aliasPersonajes,
  };
}

// ─── 6. Pre-segmentación Espacial y Rectificación de Escenas ──────────────────

const SCENE_HEADING_RE =
  /^(?:(?:ACTO\s+[IVXLCDM\d]+[,\s\-—:]*)?(?:ESCENA|CUADRO)\s+(?:[IVXLCDM\d]+|PRIMERA|SEGUNDA|TERCERA|CUARTA|QUINTA|SEXTA|SÉPTIMA|SEPTIMA|OCTAVA|NOVENA|DÉCIMA|DECIMA|ÚNICA|UNICA)|(?:INT|EXT|INT\.\/EXT\.|I\/E)[\.\s].+|ESCENARIO:|MUTACIÓN:?|MUTACION:?)/i;

const ACT_HEADING_RE =
  /^(?:ACTO\s+(?:[IVXLCDM\d]+|PRIMERO|SEGUNDO|TERCERO|CUARTO|QUINTO|SEXTO|SÉPTIMO|SEPTIMO|OCTAVO|NOVENO|DÉCIMO|DECIMO)|PRIMER\s+ACTO|SEGUNDO\s+ACTO|TERCER\s+ACTO|JORNADA\s+(?:[IVXLCDM\d]+|PRIMERA|SEGUNDA|TERCERA)|PRÓLOGO|PROLOGO|EPÍLOGO|EPILOGO)\b/i;

const GENERIC_COVER_RE =
  /^(?:GUION(?:\s+TEATRAL)?|GUIÓN(?:\s+TEATRAL)?|OBRA(?:\s+DE\s+TEATRO)?|TEXTO\s+TEATRAL|LIBRETO|PERSONAJES|REPARTO|ELENCO|DRAMATIS\s+PERSONAE|CONTENIDO|INTRODUCCI[OÓ]N|PR[OÓ]LOGO|PROLOGO|EDICI[OÓ]N|PRIMERA\s+EDICI[OÓ]N|COPYRIGHT|ISBN|DERECHOS\s+RESERVADOS|AUTOR|ADAPTACI[OÓ]N)[:\s]*$/i;

function looksLikeDateOrInstitution(text: string) {
  return (
    /^(?:\d{1,2}\s+de\s+)?(?:enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre)(?:\s*,?\s*\d{4})?$/i.test(
      text,
    ) ||
    /^\d{4}$/.test(text) ||
    /comisi[oó]n|universidad|secretar[ií]a|ministerio|instituto|derechos humanos|ayuntamiento|gobierno/i.test(
      text,
    )
  );
}

/** Primera línea que parece título de la obra, no el rótulo editorial de la portada. */
export function proposeWorkTitle(lines: RawPdfLine[]): string | null {
  for (const line of lines.slice(0, 40)) {
    const raw = line.text.trim();
    if (!raw || raw.length > 80) continue;
    if (METADATA_OR_HEADER_RE.test(raw)) continue;
    const bare = raw
      .replace(/^["“«']+|["”»']+$/g, "")
      .replace(/\.$/, "")
      .trim();
    if (bare.length < 2 || bare.length > 60) continue;
    if (GENERIC_COVER_RE.test(bare) || looksLikeDateOrInstitution(bare)) continue;
    if (ACT_HEADING_RE.test(bare) || SCENE_HEADING_RE.test(bare)) continue;
    if (/^\d+$/.test(bare)) continue;
    return bare;
  }
  return null;
}

export function parseGeometricScript(
  lines: RawPdfLine[],
  rules: ScriptRules,
): GeometricScriptResult {
  const scenes: ParsedGeometricScene[] = [];
  let currentActTitle: string | undefined = undefined;

  // Extraer reparto canónico del libreto completo
  const explicitCast = extractExplicitCastList(lines);
  const knownCharacters = new Set<string>(explicitCast);

  const workTitle = proposeWorkTitle(lines);
  const initialTitle = workTitle ?? "Escena 1 (Inicio)";

  let currentScene: ParsedGeometricScene = {
    id: `scene-1`,
    title: initialTitle,
    lines: [],
    characters: [],
    description: "",
  };

  let currentCharacter: string | null = null;
  let collectiveCue: string | null = null;
  let inParenthetical = false;
  let currentParenthetical = "";
  let inSceneNote = false;
  let inCastSection = false;
  let lineCounter = 0;

  const commitSceneIfHasLines = () => {
    if (currentScene.lines.length > 0) {
      currentScene.characters = Array.from(
        new Set(
          currentScene.lines.map((l) => l.characterName).filter((c): c is string => Boolean(c)),
        ),
      );
      scenes.push(currentScene);
    }
  };

  const inlineRegex =
    /^([A-ZÁÉÍÓÚÑÜ][a-záéíóúñüA-ZÁÉÍÓÚÑÜ0-9\s\.\-—]{1,30}?)(?:\s*\(([^)]+)\))?\s*(?::|\.-|[–—]|\s+-\s+)\s*(.+)$/;

  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i];
    const text = rawLine.text.trim();
    if (!text) continue;

    // A. Filtrar metadatos editoriales y encabezados de página
    if (METADATA_OR_HEADER_RE.test(text)) {
      continue;
    }

    // B. Detectar Título de Nueva Obra o Pieza (seguido de "Personajes:" o "Guión" en las próximas 1-3 líneas)
    if (i + 2 < lines.length) {
      const next1 = lines[i + 1]?.text.trim() || "";
      const next2 = lines[i + 2]?.text.trim() || "";
      const isNextCast =
        /^(?:PERSONAJES|REPARTO)(?:\s*\([^)]+\))?[:\s]*$/i.test(next1) ||
        /^(?:PERSONAJES|REPARTO)(?:\s*\([^)]+\))?[:\s]*$/i.test(next2);
      if (
        isNextCast &&
        text.length <= 40 &&
        !STAGE_BLACKLIST.has(text.toUpperCase()) &&
        !text.startsWith("●") &&
        !text.startsWith("-")
      ) {
        commitSceneIfHasLines();
        const pieceTitle = text.replace(/\.$/, "").trim();
        currentScene = {
          id: `scene-${scenes.length + 1}`,
          title: pieceTitle,
          actTitle: pieceTitle,
          lines: [],
          characters: [],
          description: "",
        };
        currentCharacter = null;
        inSceneNote = false;
        inCastSection = false;
        continue;
      }
    }

    // C. Sección de Reparto Explícito (Personajes: ...)
    if (
      /^(?:PERSONAJES|REPARTO|DRAMATIS PERSONAE|ELENCO|ACTORES)(?:\s*\([^)]+\))?[:\s]*$/i.test(text)
    ) {
      inCastSection = true;
      continue;
    }

    if (inCastSection) {
      const isCue = /^[A-ZÁÉÍÓÚÑÜ0-9\s]{2,25}:\s*\S/.test(text);
      const isStage = STAGE_ACTION_START_RE.test(text) || text.startsWith("(");
      const isDivider = DIVIDER_RE.test(text);
      const isHeading =
        LOCATION_HEADING_RE.test(text) || SCENE_HEADING_RE.test(text) || ACT_HEADING_RE.test(text);

      if (isCue || isStage || isDivider || isHeading) {
        inCastSection = false;
        // Continuar al procesamiento de esta línea abajo
      } else {
        // Línea dentro de la lista de reparto: ignorar del diálogo y acumular en descripción
        currentScene.description = currentScene.description
          ? `${currentScene.description}\n${text}`
          : text;
        continue;
      }
    }

    if (/^(?:GUIÓN|GUION)[:\s]*$/i.test(text)) {
      continue;
    }
    if (
      /^[\u2022\u25cf\u25cb\u25a0\u25aa\u2043\u2219\u00b7\-\*\+]/.test(text) &&
      !text.includes(":")
    ) {
      continue;
    }

    // D0. «PRIMER ACTO - ESCENA n» es una escena de ese acto, no un acto nuevo.
    const actAndScene = text.match(
      /^(PRIMER\s+ACTO|SEGUNDO\s+ACTO|TERCER\s+ACTO|CUARTO\s+ACTO|QUINTO\s+ACTO|SEXTO\s+ACTO|ACTO\s+(?:[IVXLCDM]+|\d+))\s*[-—,:]\s*((?:ESCENA|CUADRO)\s+.+)$/i,
    );
    if (actAndScene) {
      currentActTitle = actAndScene[1].replace(/\s+/g, " ").trim().toUpperCase();
      const scenePart = actAndScene[2].replace(/[:.\-—]+$/, "").trim();
      commitSceneIfHasLines();
      currentScene = {
        id: `scene-${scenes.length + 1}`,
        title: `${currentActTitle} - ${scenePart}`,
        actTitle: currentActTitle,
        lines: [],
        characters: [],
        description: "",
      };
      currentCharacter = null;
      inSceneNote = false;
      continue;
    }

    // D. Detección de Acto
    if (ACT_HEADING_RE.test(text) && !SCENE_HEADING_RE.test(text)) {
      currentActTitle = text.replace(/[:.\-—]+$/, "").trim();
      commitSceneIfHasLines();
      currentScene = {
        id: `scene-${scenes.length + 1}`,
        title: currentActTitle,
        actTitle: currentActTitle,
        lines: [],
        characters: [],
        description: "",
      };
      currentCharacter = null;
      inSceneNote = false;
      continue;
    }

    // E. Detección de Escena Formal
    if (SCENE_HEADING_RE.test(text)) {
      commitSceneIfHasLines();
      const title = currentActTitle
        ? `${currentActTitle} - ${text.replace(/[:\.\-—]+$/, "").trim()}`
        : text.replace(/[:\.\-—]+$/, "").trim();

      currentScene = {
        id: `scene-${scenes.length + 1}`,
        title,
        actTitle: currentActTitle,
        lines: [],
        characters: [],
        description: "",
      };
      currentCharacter = null;
      inSceneNote = false;
      continue;
    }

    // F. Separadores de escena informales (ej. ".-.-.-.-.-.-.-.-.-.-", "***", "---")
    if (DIVIDER_RE.test(text)) {
      commitSceneIfHasLines();
      currentScene = {
        id: `scene-${scenes.length + 1}`,
        title: `Escena ${scenes.length + 1}`,
        lines: [],
        characters: [],
        description: "",
      };
      currentCharacter = null;
      inSceneNote = false;
      continue;
    }

    // G. Localizaciones como encabezados de escena (ej. "En el panteón.")
    if (LOCATION_HEADING_RE.test(text) && text.length <= 40) {
      if (currentScene.lines.length > 0) {
        commitSceneIfHasLines();
        currentScene = {
          id: `scene-${scenes.length + 1}`,
          title: text.replace(/\.$/, "").trim(),
          lines: [],
          characters: [],
          description: "",
        };
      } else {
        currentScene.title = `${currentScene.title} - ${text.replace(/\.$/, "").trim()}`;
      }
      currentCharacter = null;
      inSceneNote = false;
      continue;
    }

    // H. Detección de Anotaciones de Escena / Intención Dramática / Elementos Técnicos
    if (SCENE_NOTE_PREFIX_RE.test(text)) {
      inSceneNote = true;
      currentCharacter = null;
      currentScene.description = currentScene.description
        ? `${currentScene.description}\n\n${text}`
        : text;
      currentScene.lines.push({
        id: `line-${++lineCounter}`,
        type: "acotacion",
        text,
        page: rawLine.page,
        x: rawLine.x,
        y: rawLine.y,
      });
      continue;
    }

    // Si nos encontramos dentro de una nota o intención dramática multilínea
    if (inSceneNote) {
      const candidateInline = text.match(inlineRegex);
      const isRealInlineChar =
        candidateInline &&
        !STAGE_BLACKLIST.has(
          candidateInline[1]
            .replace(/[:\.\-—–]+$/, "")
            .trim()
            .toUpperCase(),
        );

      const isStandaloneUpper =
        text === text.toUpperCase() && text.length <= 35 && !/^\d+$/.test(text);
      const isRealUpperChar =
        isStandaloneUpper &&
        !STAGE_BLACKLIST.has(
          text
            .replace(/[:\.\-—–]+$/, "")
            .replace(/\([^)]+\)/g, "")
            .trim(),
        );

      if (isRealInlineChar || isRealUpperChar || text.startsWith("(")) {
        inSceneNote = false;
        // Sale de la nota y continúa al procesamiento del diálogo o acotación abajo
      } else {
        // Continuación del bloque de descripción de la escena
        currentScene.description = currentScene.description
          ? `${currentScene.description}\n${text}`
          : text;
        currentScene.lines.push({
          id: `line-${++lineCounter}`,
          type: "acotacion",
          text,
          page: rawLine.page,
          x: rawLine.x,
          y: rawLine.y,
        });
        continue;
      }
    }

    // I. Acciones escénicas no parentéticas (ej. "Mientras DON JUAN escribe...", "Entra Don Luis...")
    if (STAGE_ACTION_START_RE.test(text)) {
      currentCharacter = null;
      currentScene.lines.push({
        id: `line-${++lineCounter}`,
        type: "acotacion",
        text,
        page: rawLine.page,
        x: rawLine.x,
        y: rawLine.y,
      });
      continue;
    }

    // J. Caso Prefijo en Línea (ej. "Narrador: Es de noche...", "Peter: Entraremos...", "JUAN.- ¡Hola!")
    const inlineMatch = text.match(inlineRegex);
    if (inlineMatch) {
      const rawCandidate = inlineMatch[1]
        .replace(/[:\.\-—–]+$/, "")
        .trim()
        .toUpperCase();
      if (!STAGE_BLACKLIST.has(rawCandidate) && rawCandidate.length >= 2) {
        if (/^(?:TODOS|TODAS)(?:\s+L[OA]S\s+PRESENTES)?$/.test(rawCandidate)) {
          collectiveCue = rawCandidate;
          currentCharacter = null;
          const dialogueText = inlineMatch[3]?.trim();
          if (dialogueText) {
            currentScene.lines.push({
              id: `line-${++lineCounter}`,
              type: "dialogo",
              parenthetical: rawCandidate,
              text: dialogueText,
              page: rawLine.page,
              x: rawLine.x,
              y: rawLine.y,
            });
          }
          continue;
        }
        collectiveCue = null;
        const { rectifiedName } = rectifyCharacterCandidate(
          rawCandidate,
          explicitCast,
          knownCharacters,
        );
        const canonicalName = rules.aliasPersonajes[rectifiedName] || rectifiedName;
        knownCharacters.add(canonicalName);

        const parenthetical = inlineMatch[2]?.trim();
        const dialogueText = inlineMatch[3]?.trim();

        currentScene.lines.push({
          id: `line-${++lineCounter}`,
          type: "dialogo",
          characterName: canonicalName,
          parenthetical,
          text: dialogueText,
          page: rawLine.page,
          x: rawLine.x,
          y: rawLine.y,
        });
        currentCharacter = canonicalName;
        inParenthetical = false;
        currentParenthetical = "";
        continue;
      }
    }

    // K. Caso Nombre en Línea Independiente en Mayúsculas (ej. "NARRADOR", "LOBO", "MADRE")
    const isStandaloneName =
      text === text.toUpperCase() &&
      text.length <= 35 &&
      !/^\d+$/.test(text) &&
      !STAGE_BLACKLIST.has(text);

    if (isStandaloneName) {
      const rawCandidate = text
        .replace(/[:\.\-—–]+$/, "")
        .replace(/\([^)]+\)/g, "")
        .trim()
        .toUpperCase();

      if (/^(?:TODOS|TODAS)(?:\s+L[OA]S\s+PRESENTES)?$/.test(rawCandidate)) {
        collectiveCue = rawCandidate;
        currentCharacter = null;
        continue;
      }
      collectiveCue = null;

      if (rawCandidate.length >= 2 && !STAGE_BLACKLIST.has(rawCandidate)) {
        const { rectifiedName } = rectifyCharacterCandidate(
          rawCandidate,
          explicitCast,
          knownCharacters,
        );
        const canonical = rules.aliasPersonajes[rectifiedName] || rectifiedName;
        knownCharacters.add(canonical);
        currentCharacter = canonical;
        inParenthetical = false;
        currentParenthetical = "";
        continue;
      }
    }

    // I. Acotación entre paréntesis (monolínea o multilínea)
    if (inParenthetical) {
      currentParenthetical += (currentParenthetical.endsWith("-") ? "" : " ") + text;
      if (text.includes(")")) {
        inParenthetical = false;
        currentScene.lines.push({
          id: `line-${++lineCounter}`,
          type: "acotacion",
          characterName: currentCharacter ?? undefined,
          text: currentParenthetical.replace(/^\(|\)$/g, "").trim(),
          page: rawLine.page,
          x: rawLine.x,
          y: rawLine.y,
        });
        currentParenthetical = "";
      }
      continue;
    }

    if (text.startsWith("(")) {
      if (text.endsWith(")")) {
        currentScene.lines.push({
          id: `line-${++lineCounter}`,
          type: "acotacion",
          characterName: currentCharacter ?? undefined,
          text: text.slice(1, -1).trim(),
          page: rawLine.page,
          x: rawLine.x,
          y: rawLine.y,
        });
      } else {
        inParenthetical = true;
        currentParenthetical = text;
      }
      continue;
    }

    // J. Diálogo perteneciente al personaje activo (unir de corrido parlamentos continuos)
    if (!currentCharacter && collectiveCue) {
      currentScene.lines.push({
        id: `line-${++lineCounter}`,
        type: "dialogo",
        parenthetical: collectiveCue,
        text,
        page: rawLine.page,
        x: rawLine.x,
        y: rawLine.y,
      });
      continue;
    }

    if (currentCharacter) {
      const lastLine = currentScene.lines[currentScene.lines.length - 1];
      if (lastLine && lastLine.type === "dialogo" && lastLine.characterName === currentCharacter) {
        const sep = lastLine.text.endsWith("-") ? "" : " ";
        lastLine.text = `${lastLine.text.trim()}${sep}${text}`;
      } else {
        currentScene.lines.push({
          id: `line-${++lineCounter}`,
          type: "dialogo",
          characterName: currentCharacter,
          text,
          page: rawLine.page,
          x: rawLine.x,
          y: rawLine.y,
        });
      }
    }
  }

  commitSceneIfHasLines();

  const foldedScenes: ParsedGeometricScene[] = [];
  let carriedNotes: ParsedGeometricLine[] = [];
  for (const scene of scenes) {
    const hasDialogue = scene.lines.some((line) => line.type === "dialogo" && line.text.trim());
    if (!hasDialogue) {
      carriedNotes.push(...scene.lines);
      continue;
    }
    if (carriedNotes.length > 0) {
      scene.lines = [...carriedNotes, ...scene.lines];
      carriedNotes = [];
    }
    foldedScenes.push(scene);
  }
  if (carriedNotes.length > 0 && foldedScenes.length > 0) {
    foldedScenes[foldedScenes.length - 1].lines.push(...carriedNotes);
  }
  scenes.splice(0, scenes.length, ...foldedScenes);

  const soloNames = new Set(
    scenes.flatMap((scene) => scene.characters).filter((name) => !name.includes(" Y ")),
  );
  for (const scene of scenes) {
    for (const line of scene.lines) {
      const name = line.characterName?.toUpperCase();
      if (!name || !name.includes(" Y ")) continue;
      const parts = name.split(/\s+Y\s+/);
      if (!parts.every((part) => soloNames.has(part) || explicitCast.has(part))) continue;
      line.parenthetical = line.parenthetical ? `${name} · ${line.parenthetical}` : name;
      line.characterName = parts[0];
    }
    scene.characters = Array.from(
      new Set(
        scene.lines
          .map((line) => line.characterName)
          .filter((name): name is string => Boolean(name)),
      ),
    );
  }

  // Escena de respaldo si no hubo líneas agrupadas
  if (scenes.length === 0) {
    const fallbackLines: ParsedGeometricLine[] = lines.map((l, i) => ({
      id: `line-${i + 1}`,
      type: "dialogo",
      text: l.text,
      page: l.page,
      x: l.x,
      y: l.y,
    }));
    scenes.push({
      id: "scene-1",
      title: "Escena completa",
      lines: fallbackLines,
      characters: Array.from(knownCharacters).slice(0, 6),
    });
  }

  // Filtrar y unificar personajes canónicos en la lista global
  const cleanCharacters = Array.from(new Set(scenes.flatMap((s) => s.characters)))
    .map((name) => {
      if (name === "ABUELITA") return "ABUELA";
      if (name === "MAMÁ" || name === "MAMA") return "MADRE";
      if (name === "PAPÁ" || name === "PAPA") return "PADRE";
      if (name === "PETER") return "PETER PAN";
      return name;
    })
    .filter((name) => {
      if (STAGE_BLACKLIST.has(name)) return false;
      if (/^(?:TODOS|TODAS)(?:\s+L[OA]S\s+PRESENTES)?$/.test(name)) return false;

      // «A Y B» no es un personaje si las partes ya existen, ni un coro compuesto.
      if (name.includes(" Y ")) {
        const parts = name.split(/\s+Y\s+/);
        if (
          parts.every(
            (p) =>
              knownCharacters.has(p) ||
              explicitCast.has(p) ||
              scenes.some((s) => s.characters.includes(p)),
          )
        ) {
          return false;
        }
      }

      // Descartar quimeras residuales que unan dos personajes ya conocidos
      const words = name.split(/\s+/);
      if (words.length >= 2) {
        const w1 = words[0];
        const w2 = words.slice(1).join(" ");
        if (knownCharacters.has(w1) && (knownCharacters.has(w2) || explicitCast.has(w2))) {
          return false;
        }
      }
      return true;
    });

  const totalLines = scenes.reduce((acc, s) => acc + s.lines.length, 0);

  return {
    rules,
    scenes,
    allCharacters: cleanCharacters,
    totalLines,
    usedOllamaOrBackend: false,
    workTitle,
  };
}
