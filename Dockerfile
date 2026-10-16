# Imagen unica de produccion: Node 22.12, build Vite/TanStack, sirve dist/ via railway-server.mjs.
FROM node:22.12-bookworm-slim
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --include=dev

# Copia el arbol (public/ incluido; .dockerignore no lo excluye).
COPY . .

# Falla temprano si falta el OG fuente o el artefacto de build.
RUN test -f public/og-ensaya-ia.jpg \
  && node -v \
  && npm run build \
  && node scripts/verify-railway-dist.mjs \
  && test -f dist/client/og-ensaya-ia.jpg \
  && test -f dist/server/server.js \
  && npm prune --omit=dev \
  && npm cache clean --force

ENV NODE_ENV=production
ENV PORT=3000
EXPOSE 3000

# Sirve dist/client (estaticos + OG) y dist/server (SSR). No hay otra carpeta de salida.
CMD ["node", "railway-server.mjs"]
