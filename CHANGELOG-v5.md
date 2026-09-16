# CHANGELOG v5 — ALL VD HD ("HD Jir")

## v5.0.5 (perbaikan pasca-rilis 5)

- Fetch API client (`/api/config`, `/api/plan`, dll) diberi `cache: 'no-store'` biar
  versi/info server gak pernah stale dari cache browser setelah deploy baru.
- Penanda versi dinaikkan supaya gampang memverifikasi deploy: kalau footer masih
  menampilkan versi lama, berarti push/rebuild belum sampai (bukan bug aplikasi).

## v5.0.4 (perbaikan pasca-rilis 4)

- **Upgrade `@whiskeysockets/baileys` 6.7.24 → 7.0.0-rc14** — akar masalah pairing yang
  sebenarnya: stanza registrasi `link_code_companion_reg` di 6.x mengirim *platform-id*
  format lama (`DeviceProps.PlatformType`), sedangkan server WhatsApp terkini mengharapkan
  enum baru (`CompanionWebClientType`). Akibatnya server **membuang diam-diam** pendaftaran
  kode pairing kita → HP selalu bilang "Gagal menautkan perangkat" walau kode benar & baru.
  Di 7.x stanza dikirim dengan format baru; handshake & QR terverifikasi masih jalan.
- Smoke 45/45 lolos di atas Baileys 7.x.

## v5.0.3 (perbaikan pasca-rilis 3)

- **Pairing code UPPERCASE (membatalkan aturan lowercase v5)**: bukti lapangan + source
  Baileys menunjukkan key pairing di HP diturunkan dari string kode yang **case-sensitive**
  (Crockford base32 uppercase). Menampilkan huruf kecil membuat kode **ditolak seketika**
  di HP ("minta kode baru" padahal baru detik). Sekarang kode tampil persis aslinya
  (UPPERCASE) + instruksi UI "ketik PERSIS apa adanya" + banner `lastError` pairing di UI.
- **Batas upload dinaikkan: 100 MB → 500 MB** (default; tetap bisa di-override via
  `MAX_UPLOAD_MB`). Teks UI mengikuti nilai dari server.
- Smoke test disesuaikan (assert format kode uppercase).

## v5.0.2 (perbaikan pasca-rilis 2)

- **Pairing code (lagi, lebih dalam)**: setelah membaca source Baileys 6.7.24, ketahuan bahwa
  kode pairing **digenerate lokal** lalu didaftarkan ke server lewat satu iq TANPA ack —
  jadi retry di socket yang sama bikin kode yang tampil != yang terdaftar di server
  (gejala: kode selalu ditolak di HP). Sekarang: **satu permintaan per socket**; kalau
  gagal/kedaluwarsa tanpa dipakai → **session dibersihkan & mulai segar** otomatis;
  error terakhir pairing ikut di-broadcast ke UI (`pairing.lastError`).
- **Download gagal jadi file .json**: itu sebenarnya pesan error server (file hilang setelah
  container restart tanpa Volume). Sekarang unduhan lewat `fetch` + blob sehingga pesan error
  server DITAMPILKAN sebagai toast, bukan disimpan sebagai .json; pesan error server juga
  menjelaskan cara mencegah (pasang Volume /data).
- **Engine anti-pecah v5.0.2**: mode **Maksimal** kini 2-pass di **cap platform**
  (TikTok 12 Mbps, IG 10 Mbps, Shorts 15 Mbps — batas tertinggi yang masih diterima platform)
  + unsharp +0.05; mode Seimbang untuk target sosial pakai CRF faktor 0.72×cap (lebih padat
  detail). UI menambah tip: aktifkan "kualitas upload tinggi" di setelan aplikasi &
  upload lewat web/desktop biar gak dikompres ulang aplikasi HP.
- Meta `sizeMB` di event selesai diberi fallback; log server mencatat alasan download miss.

## v5.0.1 (perbaikan pasca-rilis)

- **Pairing code**: permintaan kode kini dikirim **begitu socket open** (tidak menunggu event
  QR — justru itu bikin handshake konflik dan kode ditolak di HP); single-flight anti
  double-klik; socket di-restart bersih bila handshake QR terlanjur aktif; retry otomatis
  sekali untuk kegagalan koneksi; pesan error lebih jelas (mengingatkan menu "Tautkan dengan
  nomor telepon" di HP).
- **Mode Unduh**: target TikTok / IG Reels-Story / YT Shorts / Universal tidak lagi wajib
  nomor & tidak kirim WA — setelah encode selesai, UI menampilkan tombol **Unduh Video HD**
  (`GET /api/download/:id`). Nomor WA tetap opsional ("kirim juga ke WA"). Riwayat mencatat
  flag `downloadOnly`.
- **Dockerfile**: `COPY client/dist` di stage runtime diambil dari stage build
  (`--from=build`) — fix error build Railway `"/client/dist": not found` karena path itu
  memang di-exclude `.dockerignore`.
- Smoke test bertambah jadi **45 assertion** (2 baru: proses tanpa nomor + unduh via API).

**v5.0.0 · by [Rifky]** — rilis ini menulis ulang identitas, desain, engine multi-platform,
pairing flow, dan pipeline deploy. Riwayat versi sebelumnya (v1–v4, brand lama) tidak lagi
disertakan; semua jejak brand lama dihapus dari kode, aset, dan dokumentasi.

---

## 1. Rebrand total

- Nama brand: **ALL VD HD** · slug: **HD Jir** · credit: **[Rifky]**.
- `package.json` → `name: newstatus-hd`, `version: 5.0.0`; client → `newstatus-hd-client`.
- Logo/identitas visual BARU dibuat dari nol (vector):
  - `client/public/brand/logo-mark.svg` (squircle gradien violet→cyan + play + status ring)
  - `logo-mark-flat.svg` (maskable, safe-zone 80%), `logo-mark-mono.svg`
  - `og-image.svg` (1200×630), `splash.svg` (1080×1920)
- `tools/make-icons.js` ditulis ulang → merender **semua** aset raster dari SVG di atas:
  ikon PWA 192/512/1024, maskable 512/1024, apple-touch 180, favicon 64/48/32,
  `og-image.png`, `splash.png`. Mesin render: sharp → cairosvg → ffmpeg(librsvg).
- `manifest.webmanifest` baru: name "ALL VD HD — Upload HD Jir", short_name "HD Jir",
  ikon + maskable + shortcuts, theme/background `#06060f`.
- `index.html`: judul/meta/OG/Twitter card baru, boot-splash gradien violet→cyan.
- Semua string UI, komentar kode, log server, nama file unduhan (`...-HD-Jir.mp4`),
  key localStorage (`hdjir_*`), prefix passlog (`hdjir_`) memakai brand baru.
- **Audit**: `grep -ri "kyy\|purehd"` pada source = 0 temuan (kecuali dokumen historis
  yang memang menyebut "engine lama" secara generik tanpa brand).

## 2. Design system baru (client)

- Palet: **violet (#8b5cf6) → indigo (#6366f1) → cyan (#22d3ee)**; latar dark premium
  `#06060f/#0a0a16`; aksen amber/red hanya untuk status/warning.
- **Glassmorphism**: `.card` = background semi-transparan + `backdrop-blur-xl` + border
  rgba putih + shadow glass; util baru `.glass-panel`.
- Tipografi: **Plus Jakarta Sans** untuk semua (display & body); dependency
  `@fontsource-variable/space-grotesk` dihapus.
- Micro-interaction dipertahankan & dirapikan (framer-motion): spring layout pill, hover
  glow, shimmer tombol primer, animasi aurora violet/cyan, equalizer, scanline QR.
- Mobile-first: layout diverifikasi pada viewport **360px** (screenshot di `docs/`).
- Bugfix v4: param URL `?page=send|connect` (dipakai shortcut manifest PWA) sekarang
  dihormati `App.jsx` (sebelumnya selalu jatuh ke halaman tersimpan).

## 3. Pairing code (server/whatsapp.js)

- `requestPairingCode()` hanya setelah **socket open + handshake QR pertama**
  (`waitForSocketOpen()` + tunggu event QR pertama).
- Selama `pairingMode`, event QR **di-suppress** (state & kode tidak tertimpa).
- Listener Baileys fiktif `'pairing.code'` **tidak ada** di kode (dihapus sejak v4,
  sekarang juga ditegaskan lewat assertion di `scripts/smoke.js`).
- Stream error **515** → auto-restart socket 1.2s **tanpa menghapus session**.
- Session rusak (`creds.registered === false`) dibersihkan sebelum pairing.
- Normalisasi nomor: `0812…`/`+62…`/`812…`/spasi → `62812…` + validasi ramah.
- **Kode 8 karakter** (case asli Crockford; v5.0.3 menegaskan uppercase setelah bukti lapangan bahwa lowercase ditolak HP).
- TTL countdown + endpoint: `POST /api/connect/pairing`, `/api/connect/pairing/refresh`,
  `/api/connect/pairing/cancel`; UI ConnectPage menampilkan kotak kode, progress TTL,
  status kedaluwarsa, dan instruksi huruf kecil.

## 4. Engine video v5 (server/video.js)

- **Target platform**: `wa | tiktok | ig | shorts | universal` (registry `TARGETS`),
  masing-masing: ladder bitrate, cap fps, auto-trim, budget ukuran, target loudness,
  default sharpen.
  - TikTok: 1080p **10 Mbps** (cap 12, fps ≤60) · 720p 6 Mbps
  - IG Reels/Story: 1080x1920 **8 Mbps** (cap 10, fps ≤30)
  - YT Shorts: 1080p **12 Mbps** (fps ≤60)
  - WA Status: ladder lama (cap 8/5/2.8/1.8) + auto-trim 30s + budget **16 MB**
  - Universal: 1080p 10 Mbps cap 12
- **Auto-trim per target**: WA 30s · IG 90s (Reels; Story dipotong IG ke 60s) ·
  Shorts 180s · TikTok/Universal tanpa batas.
- **Loudness EBU R128 dua-langkah**: pass pengukuran `loudnorm=print_format=json` lalu
  apply dengan nilai terukur + `linear=true` (gain konstan, bukan dynamic pumping);
  fallback anggun ke loudnorm dinamis bila pengukuran gagal; mode Turbo skip pengukuran.
  Target: **-14 LUFS / TP -1.0** (TikTok/IG/Shorts), **-16 / -1.5** (WA/Universal).
  Terverifikasi: output terukur **-14.0 LUFS** (ebur128).
- Audio: **AAC 48 kHz 192 kbps** (naik dari 128k).
- H.264 **High** · level **4.2** untuk ≤1080p (escalate 5.0/5.1/5.2 untuk frame besar;
  retry ladder `level=auto` bila x264 build lama menolak) · `yuv420p` · tag BT.709 ·
  `+faststart`.
- HDR→SDR: chain `zscale+tonemap` → fallback `tonemap` saja → skip + catatan (anggun).
- Scaling LANCZOS dimensi genap tanpa upscale; fps CFR via filter; **GOP = 2 detik × fps**;
  `bframes=3`, `aq-mode=3`, `psy-rd=1.0:0.15`, `trellis=2`, `rc-lookahead` 60/40/20.
- **Unsharp luma ringan default ON** untuk TikTok (0.2) & IG (0.18); target lain opt-in.
- 3 mode: Turbo (1-pass CRF cepat) · Seimbang (CRF+VBV) · Maksimal (**2-pass ABR**).
- Progress mesin via `-progress pipe:2` (persen/ETA/speed/pass akurat) + heartbeat socket.
- Retry ladder (utama → hemat → turun resolusi) & re-encode 2-pass kalau hasil melewati
  budget ukuran target.
- Deteksi RAM container (cgroup) → `LOW_MEM` mode hemat otomatis.
- API: `GET /api/config` & `/api/engine` memuat registry target; `POST /api/plan`
  menerima `target` dan mengembalikan preview resolusi/bitrate/estimasi ukuran per rung;
  `POST /api/upload` menerima field `target`.

## 5. Benchmark (scripts/engine-bench.js)

- Dibangun ulang: membandingkan **engine lama (v4, parameter di-hardcode)** vs **v5**
  per target (`wa`, `tiktok`, `ig`).
- Simulasi re-encode platform: `WA-status-hd`, `WA-status-low`, `tiktok-feed`,
  `ig-feed` — lalu diukur **SSIM + PSNR + VMAF** vs **sumber asli**.
- VMAF: dipakai bila ffmpeg punya `libvmaf` (jendela `VMAF_SECONDS`, default 6s);
  bila tidak ada → kolom `n/a` (fallback anggun, bench tetap jalan).
- `BENCH_QUICK=1` untuk varian cepat tanpa VMAF; `--hq` menambah sumber sintetis 1080p 20Mbps.
- Ringkasan tabel ditempel di README (bagian Hasil benchmark).

## 6. Deploy & operasional

- **Dockerfile multi-stage**: stage `build` (node:20-slim, npm ci --include=dev,
  `npm run build`, prune devDeps) → stage `runtime` (node:20-slim + ffmpeg sistem + tini,
  copy node_modules hasil prune + `server/` + `client/dist`). `USER node`, `EXPOSE 3000`,
  `ENTRYPOINT tini`.
- `railway.json`: builder DOCKERFILE + healthcheck `/api/health` (timeout 120s,
  restart ON_FAILURE ×10).
- Fix build Railway: `COPY client/dist` di stage runtime diambil **dari stage build**
  (`--from=build /app/client/dist`), bukan dari context — `client/dist` memang di-exclude
  `.dockerignore` sehingga COPY dari context gagal \"not found\" di builder.
- `/api/health` cepat & tanpa ffmpeg; memuat info RAM/LOW_MEM/busy untuk diagnosa.
- Semua data runtime di `DATA_DIR` (default `./data`; Railway: volume `/data`):
  session Baileys, upload sementara, video hasil, riwayat.
- `.env.example` diperbarui (target default, AUTO_TRIM, AUDIO_BITRATE_KBPS, FFPROBE_PATH, dll).
- `.gitignore`/`.dockerignore` aman: `node_modules/`, `client/dist/`, `data/`, `*.upload`,
  folder session tidak pernah masuk git/image.
- `ffmpeg-static`/`ffprobe-static` dipindah ke **optionalDependencies** + require defensif:
  di Docker dipakai ffmpeg sistem (`FFMPEG_PATH`/`FFPROBE_PATH`), install `--ignore-scripts`
  aman; dev lokal tetap dapat binary otomatis.

## 7. Lain-lain

- `scripts/smoke.js` diperluas: 45 assertion (v5.0.1; sebelumnya 43) (branding, unit pairing, plan per target,
  endpoint plan, encode nyata tiktok+ig, pipeline socket, resend, multi-target).
- Screenshot UI v5 digenerate ulang (desktop + mobile 360px) via headless Chrome.
- Dokumentasi: README ditulis ulang (spec target, pairing, deploy Railway langkah demi
  langkah, bukti verifikasi); CHANGELOG-v4 brand lama dihapus.
