# Build + runtime reproducibles para Railway (Node 22.12).
# Garantiza dist/client/og-ensaya-ia.jpg y railway-server.mjs en la imagen final.
FROM node:22.12-bookworm-slim
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --include=dev

COPY . .
RUN npm run build && node scripts/verify-railway-dist.mjs \
  && npm prune --omit=dev \
  && npm cache clean --force

ENV NODE_ENV=production
ENV PORT=3000
EXPOSE 3000
CMD ["node", "railway-server.mjs"]
