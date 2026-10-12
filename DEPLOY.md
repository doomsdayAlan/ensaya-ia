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

Config en repo (`railway.toml`):

- Builder: **RAILPACK**
- Build: `npm ci --include=dev && npm run build && node scripts/verify-railway-dist.mjs`
- Start: `npm run start` → `node railway-server.mjs` (sirve SSR + `dist/client`, incl. `public/` → `/og-ensaya-ia.jpg`)
- Node: `engines.node >= 22.12` (tambien `.node-version` / `.nvmrc`)
- Healthcheck: `GET /og-ensaya-ia.jpg` (el deploy nuevo debe traer la imagen)

Pasos:

1. En local: `npm ci && npm run build && npm run verify:dist`
2. Confirma que el **panel del servicio** no tenga Build/Start distintos que pisen `railway.toml` (si hay override, alínealos o bórralos).
3. Variables: `VITE_REQUIRE_AUTH=true`, `AI_PROVIDER=gemini`, `GEMINI_API_KEY=...` (y Supabase solo si ya resuelven). Opcional: `RAILPACK_NODE_VERSION=22.12.0`.
4. El microfono exige HTTPS en el dominio publico.

URL actual: https://ensaya-ia-production.up.railway.app

#### Verificar que el despliegue usa el ultimo commit

1. En GitHub: copia el hash corto de `main` (`git rev-parse --short HEAD`, hoy debe coincidir con lo que ves en el repo).
2. En Railway → tu servicio → **Deployments**.
3. Abre el deploy **Success** mas reciente y compara el commit hash / mensaje con `main`.
4. Comprueba en vivo:
   - HTML: View Source — `og:image` debe ser `https://ensaya-ia-production.up.railway.app/og-ensaya-ia.jpg` (no `storage.googleapis.com/...` ni `twitter:site` `@Lovable`).
   - `curl -sI https://ensaya-ia-production.up.railway.app/og-ensaya-ia.jpg` → `200` y `Content-Type: image/jpeg`.

Si el HTML sigue con marca Lovable o el OG da 404, Railway esta sirviendo un **deploy anterior** (suele pasar cuando los builds nuevos fallan y no reemplazan el que esta en vivo).

#### Forzar un redeploy

1. Railway → Deployments → **Redeploy** en el deploy del commit correcto (o **Deploy** → branch `main`).
2. Si el build esta cacheado/roto: Variables → agrega temporalmente `NO_CACHE=1`, redeploy, luego quítala.
3. Revisa los **Build Logs**: debe verse Node ≥ 22.12, `vite build`, y `verify-railway-dist` OK con `dist/client/og-ensaya-ia.jpg`.
4. Si el build falla (p. ej. `vite: not found`), confirma que el Build Command incluye `npm ci --include=dev` y que Vite esta en `dependencies` (como en este repo).

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
