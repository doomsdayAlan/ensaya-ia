/**
 * Falla el build si el artefacto de Railway no incluye lo esencial.
 * Vite debe copiar public/ → dist/client/ (incluido og-ensaya-ia.jpg).
 */
import { existsSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL(".", import.meta.url)), "..");
const checks = [
  "dist/client/og-ensaya-ia.jpg",
  "dist/server/server.js",
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

if (failed) {
  console.error(
    "[verify-railway-dist] El build no genero dist/client + dist/server listos para railway-server.mjs.",
  );
  process.exit(1);
}
