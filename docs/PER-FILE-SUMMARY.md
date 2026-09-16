# Ringkasan Perubahan per File — v5.0.0 "HD Jir"

Legenda: ✚ file baru · ✎ ditulis ulang / perubahan besar · ● perbaikan kecil

## Root / deploy

| File | Perubahan |
|---|---|
| `package.json` | ✎ name `newstatus-hd` v5.0.0; scripts (`icons`, `smoke`, `bench`, `verify:encodes`, `build`, `dev`, `start`); ffmpeg-static/ffprobe-static → **optionalDependencies**; devDeps `concurrently` + `sharp ^0.35.4`; workspaces `client` |
| `package-lock.json` | ✎ regenerate sesuai layout dep v5 |
| `Dockerfile` | ✎ multi-stage: build (node:20-slim, npm ci --include=dev --ignore-scripts + fallback, `npm run build`, prune devDeps) → runtime (ffmpeg sistem + tini, `USER node`, `EXPOSE 3000`, `DATA_DIR=/data`, `FFMPEG_PATH/FFPROBE_PATH=/usr/bin`, ENTRYPOINT tini) |
| `railway.json` | ✎ builder DOCKERFILE + healthcheck `GET /api/health` (120s) + restart ON_FAILURE |
| `.env.example` | ✎ semua variabel v5 (PORT, DATA_DIR, MOCK_SEND, APP_KEY, FFMPEG_THREADS, LOW_MEM, FFPROBE_PATH, DEFAULT_TARGET, AUTO_TRIM, AUDIO_*) |
| `.gitignore` / `.dockerignore` | ✎ aman: node_modules, dist, data, session, *.upload, log; docker image tanpa samples/docs |
| `Procfile` | ✚ `web: npm start` (fallback platform PaaS lain) |

## Server

| File | Perubahan |
|---|---|
| `server/config.js` | ✎ env-driven; DATA_DIR otomatis ke `RAILWAY_VOLUME_MOUNT_PATH`; deteksi RAM cgroup → LOW_MEM; konstanta engine (audio 192k, GOP 2s, trim default) |
| `server/video.js` | ✎ **ALL VD HD Engine v5**: registry TARGETS (wa/tiktok/ig/shorts/universal) + MODES (turbo/balanced/max 2-pass); ladder bitrate & cap fps per target; auto-trim & budget ukuran; loudnorm 2-langkah (ukur JSON → linear); HDR→SDR tonemap chain + fallback anggun; LANCZOS genap tanpa upscale; CFR; level 4.2 ≤1080p + escalate; unsharp default per target; progress `-progress pipe:2`; retry ladder; **cancel tahan-fase** (flag cancel tertunda); probe/extractMeta/plan/`targetDims`/`buildFilters`/`measureLoudness` |
| `server/whatsapp.js` | ✎ pairing FIX (v5.0.1: minta kode begitu socket open, single-flight, restart bersih bila QR aktif, retry koneksi); suppress QR saat pairingMode; hapus listener fiktif; 515 auto-restart tanpa hapus session; bersihkan session rusak; normalisasi nomor; kode **8 char lowercase**; TTL; endpoint pairing/refresh/cancel |
| `server/index.js` | ✎ REST `/api/config /health /status /engine /upload /plan /history /download/:id` + pairing endpoints; socket.io pipeline (upload→kompres→kirim/unduh→history); multi-target; **mode unduh tanpa nomor untuk target non-WA**; resend; static client/dist; error ramah Indonesia |
| `server/history.js` | ● persist riwayat di DATA_DIR + field platform |
| `server/logger.js` | ● logger berwarna + level via env |

## Client (React + Vite + Tailwind)

| File | Perubahan |
|---|---|
| `client/package.json` | ✎ name `newstatus-hd-client` v5.0.0; hapus font Space Grotesk |
| `client/index.html` | ✎ judul/meta/OG/Twitter baru; boot-splash gradien |
| `client/public/manifest.webmanifest` | ✎ ALL VD HD / HD Jir; ikon + maskable + shortcuts; theme #06060f |
| `client/tailwind.config.js` · `client/src/index.css` | ✎ design system: palet violet→cyan, glassmorphism, chip, util micro-interaction, Plus Jakarta Sans |
| `client/src/App.jsx` | ✎ routing 2 halaman + hormati `?page=` (fix bug v4) |
| `client/src/main.jsx` | ● boot + service worker guard |
| `client/src/lib/store.js` · `api.js` | ✎ key `hdjir_*`; upload XHR dengan field `target`; helper plan |
| `components/Logo.jsx` | ✎ logo SVG baru (squircle gradien + play + ring status) |
| `components/Splash.jsx` | ✎ splash gradien violet→cyan + tagline |
| `components/Navbar.jsx` | ✎ pill navigasi glass + badge status koneksi |
| `components/ConnectPage.jsx` | ✎ tab QR/Pairing; kotak kode pairing + countdown TTL; instruksi lowercase; tombol refresh/cancel; kartu progress 3 langkah |
| `components/SendPage.jsx` | ✎ alur 3 langkah (Pilih Video → Atur Engine → Tujuan & Kirim); statistik; dropzone |
| `components/EngineControls.jsx` | ✎ **Target Platform picker** 5 kartu; ladder resolusi + bitrate + estimasi ukuran; mode engine; toggle trim & sharpen (default per target); panel **Rencana Encode** (chip fps/profile/GOP/audio/loudness/unsharp/budget) |
| `components/ProcessPanel.jsx` | ✎ progress bar + pass 2-pass + retry ladder UI + ETA/speed |
| `components/SuccessCard.jsx` | ✎ hasil + chip platform + langkah forward ke Status |
| `components/HistoryPanel.jsx` | ● riwayat + chip platform + resend |
| `components/SettingsModal.jsx` | ● pengaturan lokal (target default, mode, sharpen) |
| `components/Footer.jsx` | ✎ credit [Rifky] + disclaimer |

## Brand & tooling

| File | Perubahan |
|---|---|
| `client/public/brand/logo-mark.svg` · `-flat` · `-mono` | ✚ identitas vektor baru |
| `client/public/brand/og-image.svg` | ✚ OG 1200×630 (layout chip & teks sudah ditune) |
| `client/public/brand/splash.svg` | ✚ splash 1080×1920 |
| `tools/make-icons.js` | ✎ render 11 target raster (ikon 192/512/1024, maskable, apple-touch, favicon 64/48/32, og-image.png, splash.png) dengan density-cap |
| `client/public/icons/*` + `favicon*` + `og-image.png` + `splash.png` | ✚ hasil generate (11/11 OK) |

## Scripts, sampel, docs

| File | Perubahan |
|---|---|
| `scripts/smoke.js` | ✎ 45 assertion e2e (branding, unit pairing, plan, endpoint, encode nyata, socket pipeline, resend, multi-target, mode unduh) |
| `scripts/engine-bench.js` | ✎ v4-lama vs v5 per target + simulasi re-encode platform + SSIM/PSNR/VMAF + summary.json |
| `scripts/verify-encodes.js` | ✚ uji encode nyata portrait/4K/HDR10 × tiktok/ig + bukti ffprobe & loudness |
| `samples/*.mp4` | ✚ 3 sumber uji bench |
| `docs/screenshots/*.png` | ✚ 6 screenshot UI v5 (desktop + mobile 360px) |
| `docs/verification/*` | ✚ bukti: smoke.txt, bench.log, bench-summary.json, ffprobe-*.txt, encodes.json |
| `README.md` | ✎ ditulis ulang (spec target, pairing, deploy Railway, bukti) |
| `CHANGELOG-v5.md` | ✚ changelog v5 (menggantikan CHANGELOG-v4 brand lama yang dihapus) |
| `docs/PER-FILE-SUMMARY.md` | ✚ file ini |
