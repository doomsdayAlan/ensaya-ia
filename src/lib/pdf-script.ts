/** Extrae texto de un PDF con pdf.js (RF2: importar libretos .pdf). */

export async function extractPdfText(file: File) {
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString();
  const data = new Uint8Array(await file.arrayBuffer());
  const document = await pdfjs.getDocument({ data }).promise;
  const pages: string[] = [];
  for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
    const page = await document.getPage(pageNumber);
    const content = await page.getTextContent();
    const line = content.items
      .map((item) => ("str" in item ? item.str : ""))
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();
    if (line) pages.push(line);
  }
  const rawText = pages.join("\n\n").trim();
  if (!rawText) throw new Error("El PDF no tiene texto extraible. Prueba un .txt o un PDF no escaneado.");
  return rawText;
}

export async function readScriptFile(file: File) {
  if (file.name.toLowerCase().endsWith(".pdf") || file.type === "application/pdf") {
    return extractPdfText(file);
  }
  return file.text();
}
