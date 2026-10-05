import { defineConfig, loadEnv } from "vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import tsConfigPaths from "vite-tsconfig-paths";

// Dev local en :8080. Para Cloudflare, ver DEPLOY.md (plugin cloudflare() antes de tanstackStart).
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  if (env.GEMINI_API_KEY) process.env.GEMINI_API_KEY ??= env.GEMINI_API_KEY;
  if (env.GOOGLE_GENERATIVE_AI_API_KEY) {
    process.env.GOOGLE_GENERATIVE_AI_API_KEY ??= env.GOOGLE_GENERATIVE_AI_API_KEY;
  }
  if (env.GROQ_API_KEY) process.env.GROQ_API_KEY ??= env.GROQ_API_KEY;
  if (env.OPENAI_API_KEY) process.env.OPENAI_API_KEY ??= env.OPENAI_API_KEY;
  if (env.AI_PROVIDER) process.env.AI_PROVIDER ??= env.AI_PROVIDER;
  if (env.AI_MODEL) process.env.AI_MODEL ??= env.AI_MODEL;
  if (env.GEMINI_MODEL) process.env.GEMINI_MODEL ??= env.GEMINI_MODEL;
  if (env.GROQ_MODEL) process.env.GROQ_MODEL ??= env.GROQ_MODEL;
  if (env.OPENAI_MODEL) process.env.OPENAI_MODEL ??= env.OPENAI_MODEL;
  if (env.AI_TIMEOUT_MS) process.env.AI_TIMEOUT_MS ??= env.AI_TIMEOUT_MS;

  return {
  server: {
    host: true,
    port: 8080,
  },
  resolve: {
    alias: {
      "@": `${process.cwd()}/src`,
    },
    dedupe: [
      "react",
      "react-dom",
      "react/jsx-runtime",
      "react/jsx-dev-runtime",
      "@tanstack/react-query",
      "@tanstack/query-core",
    ],
  },
  plugins: [
    tailwindcss(),
    tsConfigPaths({ projects: ["./tsconfig.json"] }),
    tanstackStart({
      server: { entry: "server" },
      importProtection: {
        behavior: "error",
        client: {
          files: ["**/server/**"],
          specifiers: ["server-only"],
        },
      },
    }),
    viteReact(),
  ],
  };
});
