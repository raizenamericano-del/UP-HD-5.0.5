# ============================================================================
# ALL VD HD v5 (HD Jir) — Docker image multi-stage (Railway / VPS / Fly.io)
# ALL VD HD Engine v5 by [Rifky]
#
# Stage 1 (build)  : install semua deps (termasuk devDeps utk Vite) + build client
# Stage 2 (runtime): hanya node_modules hasil prune + server + client/dist
#                    + ffmpeg sistem (lebih cepat & hemat RAM daripada static)
# ============================================================================

# ---------- Stage 1: build ----------
FROM node:20-slim AS build

# ⚠️ NODE_ENV=production JANGAN dipasang sebelum install dependencies —
# `vite` (build frontend) itu devDependency.
ENV NPM_CONFIG_UPDATE_NOTIFIER=false
ENV NPM_CONFIG_FUND=false
WORKDIR /app

# Copy manifest dulu biar layer cache tidak batal tiap ganti source
COPY package.json package-lock.json* ./
COPY client/package.json client/package.json

# --include=dev WAJIB: build client butuh vite/tailwind/postcss.
# --ignore-scripts: ffmpeg-static tidak perlu download binary di stage build
# (runtime pakai ffmpeg sistem lewat FFMPEG_PATH).
RUN NODE_ENV=development npm ci --include=dev --no-audit --no-fund --ignore-scripts \
  || NODE_ENV=development npm install --include=dev --no-audit --no-fund --ignore-scripts

# ---------- Source & build frontend ----------
COPY . .

RUN npm run build \
  && test -f client/dist/index.html \
  && echo "✅ Build client OK (client/dist/index.html ada)"

# Rapikan: buang devDependencies (image runtime lebih kecil)
RUN npm prune --omit=dev --no-audit --no-fund || true

# ---------- Stage 2: runtime ----------
FROM node:20-slim AS runtime

# ffmpeg + ffprobe sistem + tini (init utk teruskan SIGTERM Railway)
RUN apt-get update \
  && apt-get install -y --no-install-recommends ffmpeg ca-certificates tini \
  && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production
ENV PORT=3000
ENV DATA_DIR=/data
# Pakai ffmpeg sistem (bukan ffmpeg-static) — lebih cepat & hemat RAM
ENV FFMPEG_PATH=/usr/bin/ffmpeg
ENV FFPROBE_PATH=/usr/bin/ffprobe

WORKDIR /app
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json ./package.json
COPY server ./server
# client/dist diambil dari stage build (BUKAN dari context — memang di-exclude
# .dockerignore biar dist lokal/basi tidak ikut terkirim ke builder)
COPY --from=build /app/client/dist ./client/dist
COPY railway.json ./railway.json
COPY README.md ./README.md

# Railway: pasang Volume dengan mount path /data biar session WhatsApp,
# riwayat & video hasil encode TIDAK hilang (filesystem container ephemeral)
RUN mkdir -p /data \
  && (chown -R node:node /app /data || true)
USER node

# Railway menyuntikkan env PORT; app bind ke 0.0.0.0:$PORT (default 3000)
EXPOSE 3000

ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["node", "server/index.js"]
