# Subir Ensaya IA a la nube

Esta guia queda lista para el dia del deploy. Hoy la app ya corre en local; la nube es el mismo frontend con HTTPS.

## Que se sube (y que no)

Se sube **esta carpeta** (el frontend TanStack Start + Vite). Eso basta para:

- login / registro / cuenta demo
- libretos (txt, md y PDF), grupos, configuracion y ensayo con IA de voz

No hace falta subir:

- `src/teleprompter/` (FastAPI + Whisper): el ensayo web no lo usa
- un servidor propio de Python
- Supabase, hasta que el proyecto tenga URL que resuelva por DNS

Los datos de cada persona viven en **su navegador**: cuentas en IndexedDB (tablas `users` y `perfil_usuario`) y libretos en `localStorage`. Eso tambien funciona en la nube. Cuando haya un proyecto Supabase con DNS real, se puede pasar auth a Postgres.

## Antes de subir (checklist)

- [ ] `npm run test:voice` pasa
- [ ] `npm run build` termina sin error
- [ ] Chrome en `http://localhost:8080` pide login y el ensayo funciona
- [ ] Existe `.env` local; **no** lo subas con claves reales (ya esta en `.gitignore`)
- [ ] En el panel del hosting copia las variables de `.env.example`
- [ ] Dominio con **HTTPS** (el microfono no funciona en HTTP publico)

Variables minimas en la nube:

```
VITE_REQUIRE_AUTH=true
AI_PROVIDER=gemini
GEMINI_API_KEY=tu-clave
```

`GEMINI_API_KEY` no lleva prefijo `VITE_`: vive solo en el servidor. Si omites las de Supabase, la app sigue con libretos locales. Si las pones y el host no existe, ignora el error de red y usa lo local.

## Donde alojarlo

La version entregada en junio 2026 corre en Railway con `npm run start` (`railway-server.mjs`). Cloudflare y Vercel siguen siendo validas.

### Railway (como la ultima version desplegada)

1. `npm run build`
2. En Railway: Build `npm run build`, Start `npm run start`
3. Variable `VITE_REQUIRE_AUTH=true` (y las de Supabase solo si ya resuelven)
4. El microfono exige HTTPS en el dominio publico

URL actual: https://ensaya-ia-production.up.railway.app

### A) Cloudflare Workers (recomendado para este repo)

1. Cuenta en [Cloudflare](https://dash.cloudflare.com/) + Wrangler:

```bash
npm install -D wrangler
npx wrangler login
```

2. En la raiz, crea `wrangler.jsonc`:

```jsonc
{
  "$schema": "node_modules/wrangler/config-schema.json",
  "name": "ensaya-ia",
  "compatibility_date": "2026-09-07",
  "compatibility_flags": ["nodejs_compat"],
  "main": "@tanstack/react-start/server-entry",
  "observability": { "enabled": true }
}
```

3. En `vite.config.ts`, el plugin de Cloudflare debe ir **antes** de `tanstackStart`:

```ts
import { cloudflare } from "@cloudflare/vite-plugin";

plugins: [
  tailwindcss(),
  tsConfigPaths({ projects: ["./tsconfig.json"] }),
  cloudflare({ viteEnvironment: { name: "ssr" } }),
  tanstackStart({
    server: { entry: "server" },
    importProtection: { /* igual que ahora */ },
  }),
  viteReact(),
],
```

4. En `package.json` anade `"deploy": "npm run build && wrangler deploy"`.
5. En el dashboard: **Workers & Pages → Variables** → `VITE_REQUIRE_AUTH=true`.
6. `npm run deploy`. Queda en `https://ensaya-ia.<tu-cuenta>.workers.dev`.
7. Dominio propio: Workers → Custom domains. El microfono ya funciona por HTTPS.

Documentacion: [TanStack Start en Cloudflare](https://developers.cloudflare.com/workers/framework-guides/web-apps/tanstack-start/).

### B) Vercel

TanStack Start en Vercel usa Nitro.

```bash
npm install nitro
```

En `vite.config.ts`:

```ts
import { nitro } from "nitro/vite";
// plugins: [tanstackStart(...), nitro(), viteReact()]
```

Luego:

1. Sube el repo a GitHub.
2. [vercel.com/new](https://vercel.com/new) → importa el repo.
3. Framework: **TanStack Start**. Build: `npm run build`.
4. Environment Variables: `VITE_REQUIRE_AUTH=true`.
5. Deploy. Elige un dominio `*.vercel.app` o el tuyo (HTTPS automatico).

O desde la terminal: `npx vercel --prod`.

### C) Netlify

```bash
npm install -D @netlify/vite-plugin-tanstack-start
```

Registra el plugin en `vite.config.ts` segun [Hosting de TanStack Start](https://tanstack.com/start/latest/docs/framework/react/guide/hosting). En Netlify UI: build `npm run build`, variable `VITE_REQUIRE_AUTH=true`.

## Como se hace el dia D (orden corto)

1. Commit de lo que quieras publicar (sin `.env`).
2. `git push` al remoto (GitHub u origin de Cursor).
3. Conecta el repo al hosting elegido arriba.
4. Pega `VITE_REQUIRE_AUTH=true` en el panel.
5. Espera el build verde y abre la URL HTTPS.
6. Prueba: login demo → Configurar ensayo → microfono → una escena.

Si el build falla, casi siempre es el plugin de hosting mal ordenado o Node &lt; 22. En Cloudflare el plugin `cloudflare()` tiene que ir antes de `tanstackStart`.

## Despues: cuentas en la nube (opcional)

Hoy las contrasenas estan en `localStorage` (demo escolar). Cuando haya un proyecto Supabase con URL que resuelva:

1. Crea el proyecto en [supabase.com](https://supabase.com).
2. Pon `VITE_SUPABASE_URL` y `VITE_SUPABASE_PUBLISHABLE_KEY` en el hosting.
3. En Authentication → URL configuration, anade el dominio HTTPS como Redirect URL.
4. El codigo de datos (`src/lib/rehearsal-data.ts`) ya intenta Supabase y, si falla, cae a lo local.

No hace falta apagar el candado de login: `AuthGate` sigue pidiendo cuenta; solo cambia *donde* vive esa cuenta.

## Si el microfono no funciona en la URL publica

- Tiene que ser `https://...` (no `http://`).
- Chrome o Edge, no Firefox.
- El usuario tiene que pulsar "Permitir" en el candado de la barra.
- Safari iOS es irregular con `webkitSpeechRecognition`.
