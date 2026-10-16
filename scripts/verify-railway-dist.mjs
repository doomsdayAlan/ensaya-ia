/**
 * Falla el build si el artefacto de produccion no incluye lo esencial.
 * Vite debe copiar public/ → dist/client/ (incluido og-ensaya-ia.jpg).
 */
import { existsSync, readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL(".", import.meta.url)), "..");
const checks = [
  "public/og-ensaya-ia.jpg",
  "dist/client/og-ensaya-ia.jpg",
  "dist/server/server.js",
  "railway-server.mjs",
];

let failed = false;
for (const rel of checks) {
  const abs = resolve(root, rel);
  if (!existsSync(abs) || !statSync(abs).isFile()) {
    console.error(`[verify-railway-dist] FALTA: ${rel}`);
    failed = true;
    continue;
  }
  console.log(`[verify-railway-dist] OK: ${rel} (${statSync(abs).size} bytes)`);
}

// Senal de que el SSR empaquetado es el build actual (lang es-MX en el shell).
const serverBundle = resolve(root, "dist/server/server.js");
const serverAssetsDir = resolve(root, "dist/server/assets");
if (existsSync(serverAssetsDir)) {
  const { readdirSync } = await import("node:fs");
  const files = readdirSync(serverAssetsDir).filter((f) => f.endsWith(".js"));
  let sawLang = false;
  for (const file of files) {
    const text = readFileSync(resolve(serverAssetsDir, file), "utf8");
    if (text.includes("es-MX")) {
      sawLang = true;
      break;
    }
  }
  // Tambien revisar el entry por si el string queda ahi.
  if (!sawLang && existsSync(serverBundle)) {
    sawLang = readFileSync(serverBundle, "utf8").includes("es-MX");
  }
  if (!sawLang) {
    console.error(
      "[verify-railway-dist] FALTA senal lang=es-MX en dist/server (build desactualizado o mal empaquetado).",
    );
    failed = true;
  } else {
    console.log("[verify-railway-dist] OK: lang es-MX presente en el bundle SSR");
  }
}

if (failed) {
  console.error(
    "[verify-railway-dist] El build no genero dist/client + dist/server listos para railway-server.mjs.",
  );
  process.exit(1);
}
