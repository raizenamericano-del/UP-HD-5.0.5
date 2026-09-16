'use strict';
/**
 * ============================================================================
 *  ALL VD HD — Server utama (Express + Socket.io)  ·  v5  ·  by [Rifky]
 * ============================================================================
 *  REST:
 *   GET    /api/health                  → healthcheck cepat (Railway)
 *   GET    /api/config                  → konfigurasi publik + target platform + engine
 *   GET    /api/engine                  → info mesin video (ALL VD HD Engine v5) + capabilities
 *   GET    /api/status                  → status koneksi WhatsApp
 *   POST   /api/connect/qr              → mulai socket & minta QR
 *   POST   /api/connect/pairing         → minta pairing code 8 char (Crockford uppercase)
 *   POST   /api/connect/pairing/refresh → kode baru / kode kedaluwarsa
 *   POST   /api/connect/pairing/cancel  → batal pairing, balik ke QR
 *   POST   /api/disconnect              → putus koneksi (session disimpan)
 *   POST   /api/logout                  → logout + hapus session
 *   POST   /api/upload                  → upload video (multipart) + plan per target
 *   POST   /api/plan                    → preview rencana encode (resolusi, bitrate, estimasi ukuran)
 *   GET    /api/history                 → riwayat pengiriman
 *   DELETE /api/history/:id             → hapus entri riwayat
 *   DELETE /api/history                 → hapus semua riwayat
 *   GET    /api/thumb/:id               → thumbnail video riwayat
 *   GET    /api/download/:id            → unduh video hasil kompres (HD)
 *
 *  Socket (client → server): video:process, video:resend, video:cancel,
 *                            history:get, history:delete
 *  Socket (server → client): conn:update, pairing:code, job:start,
 *                            compress:start, compress:progress, compress:done,
 *                            send:start, send:ack, send:done, send:error,
 *                            history:update, notice
 * ============================================================================
 */
const express = require('express');
const http = require('http');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const multer = require('multer');
const { Server } = require('socket.io');
const config = require('./config');
const { log } = require('./logger');
const historyStore = require('./history');
const WhatsAppManager = require('./whatsapp');
const videoLib = require('./video');

const app = express();
const httpServer = http.createServer(app);
const io = new Server(httpServer, {
  maxHttpBufferSize: 2e6,
  cors: { origin: true, credentials: true },
  // Encode video berat bisa bikin client nganggur lama; timeout dinaikin biar
  // koneksi gak dianggap mati di tengah proses.
  pingTimeout: 90000,
  pingInterval: 25000,
});

app.use(express.json({ limit: '1mb' }));

/* ============================================================
 * Auth opsional (APP_KEY)
 * ============================================================ */
function authOk(req) {
  return !config.APP_KEY || req.get('x-app-key') === config.APP_KEY;
}
app.use('/api', (req, res, next) => {
  if (req.path === '/health') return next(); // healthcheck selalu terbuka
  if (!authOk(req)) return res.status(401).json({ error: 'App key salah atau tidak ada.' });
  next();
});
io.use((socket, next) => {
  if (!config.APP_KEY || socket.handshake.auth?.key === config.APP_KEY) return next();
  next(new Error('unauthorized'));
});

/* ============================================================
 * WhatsApp manager
 * ============================================================ */
const wa = new WhatsAppManager(io);

/* ============================================================
 * Upload (multer) — file sementara di DATA_DIR/uploads
 * ============================================================ */
const uploads = new Map(); // uploadId → meta

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, config.UPLOAD_DIR),
  filename: (_req, _file, cb) => cb(null, `up_${crypto.randomBytes(8).toString('hex')}.upload`),
});
const uploadMw = multer({
  storage,
  limits: { fileSize: config.MAX_UPLOAD_MB * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ok =
      (file.mimetype || '').startsWith('video/') ||
      /\.(mp4|mov|mkv|avi|webm|3gp|m4v|mpeg|mpg|wmv|flv|ts|hevc)$/i.test(file.originalname || '');
    cb(ok ? null : new Error('Itu bukan file video bro (MP4/MOV/MKV/AVI/WebM/3GP).'), ok);
  },
}).single('video');

/* ============================================================
 * Pipeline: proses video (compress → send) dengan single-flight
 * ============================================================ */
const activeJob = { running: false, cancel: null, uploadId: null, startedAt: null };

function emitTo(socket, event, data) {
  try { socket.emit(event, data); } catch (_) { /* noop */ }
}

/** Normalisasi nomor tujuan: 0812… → 62812…, +62 → 62, dst */
function normalizeNumber(input) {
  let n = String(input || '').replace(/[^\d]/g, '');
  if (!n) throw new Error('Nomor tujuannya kosong.');
  if (n.startsWith('0')) n = `62${n.slice(1)}`;
  if (n.startsWith('8')) n = `62${n}`;
  if (!/^\d{9,15}$/.test(n)) throw new Error('Nomor tujuannya gak valid. Contoh: 6281234567890');
  return n;
}

function friendlyError(err) {
  const msg = (err && err.message) || 'Ada yang error, coba lagi ya.';
  if (/dibatalkan/i.test(msg)) return { code: 'CANCELED', message: 'Proses dibatalkan.' };
  if (/belum nyambung|tidak terhubung/i.test(msg)) return { code: 'NOT_CONNECTED', message: msg };
  if (/gak ke-registrasi|tidak terdaftar/i.test(msg)) return { code: 'NOT_REGISTERED', message: msg };
  if (/403|forbidden|banned|restrict/i.test(msg)) {
    return { code: 'BANNED', message: 'WA nolak kirim videonya (nomor kemungkinan lagi dibatasi). Coba lagi nanti atau pakai nomor lain.' };
  }
  if (/413|too large|kegedean/i.test(msg)) {
    return { code: 'TOO_LARGE', message: 'Videonya kegegedan buat WA. Pilih mode Maksimal / aktifkan potong otomatis sesuai target biar ukurannya turun.' };
  }
  if (/ffmpeg|codec|invalid data|moov|stream|gagal \(exit/i.test(msg)) {
    // Server kehabisan RAM / ffmpeg dibunuh OS (umum di container kecil saat
    // video 2K/4K atau 120fps di-encode). Pesannya dibedakan biar user tahu
    // harus ngapain, dan detail teknisnya tetap dikirim buat diagnosa.
    if (err && err.oom) {
      return {
        code: 'OOM',
        message: 'Server kehabisan RAM waktu encode video ini (videonya berat: resolusi/fps tinggi). Coba mode Turbo, potong 30 detik, atau pilih resolusi lebih kecil (720p).',
        hint: 'Kalau sering kejadian, naikkan RAM container (Railway: Settings → Resources) atau set FFMPEG_THREADS=1.',
        detail: err.detail || msg,
      };
    }
    if (/DPB size|level limit|opening encoder/i.test(msg)) {
      return {
        code: 'ENCODER_INIT',
        message: 'Encoder nolak setting buat ukuran video ini. Engine bakal coba ulang otomatis dengan setting yang lebih aman.',
        detail: err.detail || msg,
      };
    }
    return {
      code: 'COMPRESS_FAILED',
      message: 'Gagal proses video. Pastikan formatnya didukung (MP4/MOV/MKV/AVI/WebM/3GP).',
      detail: (err && err.detail) || msg,
    };
  }
  if (/ENOSPC|no space/i.test(msg)) {
    return { code: 'NO_SPACE', message: 'Storage server penuh. Coba hapus riwayat dulu.' };
  }
  return { code: 'UNKNOWN', message: msg };
}

async function probeUpload(uploadId) {
  const meta = uploads.get(uploadId);
  if (!meta) throw new Error('File-nya ilang di server. Upload ulang aja.');
  if (!fs.existsSync(meta.file)) {
    uploads.delete(uploadId);
    throw new Error('File-nya ilang di server. Upload ulang aja.');
  }
  return meta;
}

/** Normalisasi opsi engine dari payload client */
function engineOptions(p = {}) {
  const target = videoLib.getTarget(p.target || config.DEFAULT_TARGET).key;
  // trim: 'auto' = ikuti limit target (WA 30s / IG 90s / Shorts 180s),
  //       'none' = mati, 'auto30' = kompat lama, angka = detik eksplisit.
  let trim = 'auto';
  if (p.trim === false || p.trim === 'none' || p.trim === '0') trim = 'none';
  else if (p.trim === true || p.trim === 'auto30') trim = 'auto30';
  else if (p.trim === 'auto') trim = 'auto';
  else if (Number(p.trim) > 0) trim = Number(p.trim);
  if (trim === 'auto' && !config.AUTO_TRIM) trim = 'none';
  return {
    target,
    quality: p.quality || 'auto',
    mode: p.mode || config.ENGINE_MODE,
    trim,
    trimStartSec: Number(p.trimStartSec) || 0,
    // Sharpen: undefined = pakai default target (TikTok/IG ON, lainnya OFF)
    sharpen: p.sharpen === true || p.sharpen === 'true' ? true : p.sharpen === false || p.sharpen === 'false' ? false : undefined,
    denoise: p.denoise === true ? true : p.denoise === false ? false : undefined,
  };
}

/**
 * Proses utama: kompres + kirim.
 * @param {object} socket socket.io client
 * @param {object} p { uploadId?, resendId?, target(s), caption?, quality?, mode?, trim? }
 */
async function runProcess(socket, p) {
  if (activeJob.running) {
    emitTo(socket, 'send:error', {
      code: 'BUSY',
      message: 'Masih ada video yang lagi diproses. Tunggu selesai dulu ya (atau klik Batalin).',
    });
    return;
  }

  activeJob.running = true;
  activeJob.startedAt = Date.now();
  const jobStartedAt = activeJob.startedAt;
  let uploadMeta = null;
  let isResend = false;
  let resendEntry = null;
  const toDelete = [];
  const opts = engineOptions(p);

  try {
    emitTo(socket, 'job:start', { uploadId: p.uploadId || null, resendId: p.resendId || null, options: opts });

    /* 1) Sumber video */
    if (p.resendId) {
      const entry = historyStore.get(p.resendId);
      resendEntry = entry;
      if (!entry || entry.status !== 'success' || !entry.videoFile) {
        throw new Error('Riwayat/file-nya udah dibersihin. Upload ulang aja.');
      }
      const vfile = path.join(config.VIDEOS_DIR, entry.videoFile);
      if (!fs.existsSync(vfile)) throw new Error('File video lamanya udah kehapus dari server. Upload ulang ya.');
      uploadMeta = {
        file: vfile,
        originalName: entry.originalName,
        ...videoLib.extractMeta(await videoLib.probe(vfile)),
      };
      isResend = true;
    } else {
      uploadMeta = await probeUpload(p.uploadId);
    }

    /* 2) Nomor tujuan — WAJIB hanya untuk target WA Status, atau kalau nomor diisi.
     *    Target lain (TikTok/IG/Shorts/Universal) = MODE UNDUH: video di-encode HD
     *    lalu bisa langsung diunduh — gak perlu nomor, gak dikirim ke WA. */
    if (!p.target && resendEntry?.platform) opts.target = resendEntry.platform;
    const platformKey = String(opts.target || 'wa');
    const rawTargets = String(p.targets || (resendEntry ? (resendEntry.targets || []).join(',') : ''))
      .split(/[,;\s]+/)
      .filter(Boolean);
    let targets = [];
    if (platformKey === 'wa' || rawTargets.length) {
      if (!rawTargets.length) {
        throw new Error('Nomor tujuannya kosong. Buat target WA Status, video dikirim ke nomor WA kamu sendiri.');
      }
      targets = rawTargets.map(normalizeNumber);
      if (targets.length > 5) throw new Error('Maksimal 5 nomor tujuan sekaligus.');
      for (const t of targets) {
        const exists = await wa.isOnWhatsApp(t);
        if (!exists) throw new Error(`${t} gak ke-registrasi di WA. Cek lagi nomornya.`);
      }
    }
    const downloadOnly = targets.length === 0;

    /* 3) Kompres (kecuali resend — file sudah terkompres) */
    let result;
    if (!isResend) {
      const jobPlan = videoLib.plan(uploadMeta, opts);
      emitTo(socket, 'compress:start', { uploadId: p.uploadId, plan: jobPlan });

      const outFile = path.join(config.VIDEOS_DIR, `${p.uploadId}.mp4`);
      const thumbFile = path.join(config.VIDEOS_DIR, `${p.uploadId}.jpg`);
      const handle = videoLib.compressVideo(
        uploadMeta.file,
        outFile,
        uploadMeta,
        (prog) => {
          activeJob.lastProgressAt = Date.now();
          emitTo(socket, 'compress:progress', { uploadId: p.uploadId, ...prog });
        },
        opts
      );
      activeJob.cancel = () => handle.cancel();
      activeJob.uploadId = p.uploadId;

      // Heartbeat: encode video berat bisa lama tanpa update (ffmpeg baru print
      // progress setelah frame pertama selesai). Tanpa ini, UI kelihatan "macet"
      // dan socket bisa dianggap timeout.
      activeJob.lastProgressAt = Date.now();
      activeJob.heartbeat = setInterval(() => {
        const idle = Date.now() - (activeJob.lastProgressAt || Date.now());
        emitTo(socket, 'compress:progress', {
          uploadId: p.uploadId,
          percent: null,
          heartbeat: true,
          idleSec: Math.round(idle / 1000),
          elapsedSec: Math.round((Date.now() - jobStartedAt) / 1000),
          note: idle > 12000 ? 'Server masih ng-encode (video berat)…' : null,
        });
      }, 5000);

      try {
        result = await handle.promise;
      } finally {
        clearInterval(activeJob.heartbeat);
        activeJob.heartbeat = null;
      }

      await videoLib.extractThumbnail(uploadMeta.file, thumbFile, {
        durationSec: uploadMeta.durationSec,
        startSec: jobPlan.trimStartSec,
      });

      emitTo(socket, 'compress:done', {
        uploadId: p.uploadId,
        sizeMB: result.sizeMB,
        width: result.width,
        height: result.height,
        profileLabel: result.profileLabel,
        mode: result.mode,
        engine: result.engine,
        trimmed: result.trimmed,
        // Kalau encode harus turun ke setting hemat, UI nunjukin itu di kartu sukses
        fellBack: result.fellBack || null,
        plan: result.plan,
      });
    } else {
      const ffMeta = await videoLib.probe(uploadMeta.file);
      const m = videoLib.extractMeta(ffMeta);
      result = {
        file: uploadMeta.file,
        sizeBytes: fs.statSync(uploadMeta.file).size,
        sizeMB: +(fs.statSync(uploadMeta.file).size / 1048576).toFixed(2),
        width: m.width,
        height: m.height,
        durationSec: m.durationSec,
        profileLabel: 'Tersimpan (HD)',
        profileKey: 'saved',
        mode: 'resend',
        modeLabel: 'Versi tersimpan',
        engine: historyStore.get(p.resendId)?.engine || 'ALL VD HD Engine',
        videoKbps: 0,
      };
    }

    /* 4) Kirim via WhatsApp (loop ke semua nomor tujuan) — dilewati kalau mode unduh */
    const sent = [];
    if (downloadOnly) {
      emitTo(socket, 'send:start', { targets: [], downloadOnly: true });
    } else {
      emitTo(socket, 'send:start', { targets });
      for (const t of targets) {
      sent.push(
        await wa.sendVideo(t, result.file, p.caption || undefined, {
          width: result.width,
          height: result.height,
          durationSec: result.durationSec,
          fileName: (uploadMeta.originalName || 'video').replace(/\.[^.]+$/, '') + '-HD.mp4',
        })
      );
      }
    }

    /* 5) Catat riwayat */
    const thumbName = isResend ? null : `${p.uploadId}.jpg`;
    const entry = historyStore.add({
      targets,
      target: targets[0] || null,
      count: targets.length,
      downloadOnly,
      platform: result.target || opts.target,
      platformLabel: result.targetLabel || videoLib.getTarget(opts.target).label,
      quality: result.profileKey || p.quality || 'auto',
      mode: result.mode || opts.mode,
      engine: result.engine || `${videoLib.ENGINE.name} v${videoLib.ENGINE.version}`,
      originalName: uploadMeta.originalName || 'video.mp4',
      durationSec: Math.round(result.durationSec * 10) / 10,
      width: result.width,
      height: result.height,
      resolution: `${result.width}x${result.height}`,
      sizeMB: result.sizeMB,
      profileLabel: result.profileLabel,
      videoKbps: result.videoKbps || 0,
      trimmed: !!result.trimmed,
      status: 'success',
      source: isResend ? 'resend' : 'upload',
      messageIds: sent.map((s) => s.messageId).filter(Boolean),
      videoFile: path.basename(result.file),
      thumbFile: thumbName,
      userCaption: (p.caption || '').slice(0, 200) || null,
    });
    io.emit('history:update', historyStore.list());

    /* 6) Bersihkan upload sementara (video hasil kompres DIPERTAHANKAN utk resend/unduh) */
    if (!isResend) toDelete.push(uploadMeta.file);
    log.info(
      `Selesai: ${entry.originalName} → ${downloadOnly ? 'UNDUH (mode unduh, tanpa WA)' : targets.join(', ')} ` +
      `(${entry.sizeMB} MB · ${entry.resolution} · ${entry.mode} · ${((Date.now() - activeJob.startedAt) / 1000).toFixed(1)}s)`
    );

    emitTo(socket, 'send:done', {
      uploadId: p.uploadId,
      resendId: p.resendId || null,
      messageIds: sent.map((s) => s.messageId),
      targets,
      target: targets[0] || null,
      entryId: entry.id,
      downloadOnly,
      downloadUrl: `/api/download/${entry.id}`,
      meta: {
        sizeMB: entry.sizeMB ?? result.sizeMB ?? null,
        durationSec: entry.durationSec,
        resolution: entry.resolution,
        profileLabel: entry.profileLabel,
        mode: entry.mode,
        engine: entry.engine,
        trimmed: entry.trimmed,
        videoKbps: entry.videoKbps,
        platform: entry.platform || null,
        platformLabel: entry.platformLabel || null,
        downloadOnly,
        downloadUrl: `/api/download/${entry.id}`,
      },
    });
  } catch (err) {
    const f = friendlyError(err);
    log.error('Proses video gagal:', err.message);
    if (err && err.detail) log.error('Detail ffmpeg:', err.detail);
    if (uploadMeta) {
      historyStore.add({
        target: p.target || null,
        originalName: uploadMeta.originalName || 'video.mp4',
        status: 'failed',
        error: f.message,
        errorCode: f.code,
        errorDetail: (f.detail || '').slice(0, 600),
        source: isResend ? 'resend' : 'upload',
        mode: opts.mode,
      });
      io.emit('history:update', historyStore.list());
    }
    emitTo(socket, 'send:error', f);
  } finally {
    toDelete.forEach((f) => videoLib.rm(f));
    if (!isResend && p.uploadId) uploads.delete(p.uploadId);
    activeJob.running = false;
    activeJob.cancel = null;
    activeJob.uploadId = null;
    activeJob.startedAt = null;
  }
}

/* ============================================================
 * REST API
 * ============================================================ */
app.get('/api/health', (_req, res) => {
  // Info RAM container: kepake buat mastiin engine milih setting yang aman
  res.json({
    ok: true,
    app: config.APP_NAME,
    version: config.VERSION,
    engine: `${videoLib.ENGINE.name} v${videoLib.ENGINE.version}`,
    waState: wa.state,
    waConnected: wa.state === 'connected',
    uptimeSec: Math.round(process.uptime()),
    busy: activeJob.running,
    mock: config.MOCK_SEND,
    // Diagnosa resource: kalau lowMem=true, engine otomatis pakai setting hemat
    mem: { limitMB: config.MEM.limitMB, from: config.MEM.fromCgroup ? 'cgroup' : 'host', lowMem: config.LOW_MEM },
    ffmpegThreads: config.FFMPEG_THREADS,
    ts: new Date().toISOString(),
  });
});

app.get('/api/config', (_req, res) => {
  res.json({
    appName: config.APP_NAME,
    brand: config.BRAND,
    slug: config.SLUG,
    tagline: config.TAGLINE,
    version: config.VERSION,
    maxUploadMB: config.MAX_UPLOAD_MB,
    maxOutputMB: config.MAX_OUTPUT_MB,
    statusMaxMB: config.STATUS_MAX_MB,
    statusMaxSec: config.STATUS_MAX_SEC,
    mockSend: config.MOCK_SEND,
    appKeyRequired: !!config.APP_KEY,
    engine: {
      name: videoLib.ENGINE.name,
      version: videoLib.ENGINE.version,
      audioBitrateKbps: videoLib.ENGINE.audioBitrateKbps,
      audioNormalize: config.AUDIO_NORMALIZE,
      codec: 'H.264 High 4.2 + AAC 192k',
      hdrTonemap: !!(videoLib.CAPS.zscale && videoLib.CAPS.tonemap) || !!videoLib.CAPS.tonemap,
      ffmpeg: videoLib.CAPS.version,
      defaultMode: config.ENGINE_MODE,
      defaultTarget: config.DEFAULT_TARGET,
      autoTrimDefault: config.AUTO_TRIM,
    },
    // Target platform (WA Status / TikTok / IG / Shorts / Universal) + ladder-nya
    targets: Object.values(videoLib.TARGETS).map((t) => ({
      key: t.key,
      label: t.label,
      short: t.short,
      desc: t.desc,
      maxFps: t.maxFps,
      trimSec: t.trimSec,
      maxMB: videoLib.targetMaxMB(t),
      loudness: t.loudness,
      sharpenDefault: t.sharpenDefault,
      ladder: t.ladder.map(({ key, label, short, mbps, capMbps, crf }) => ({
        key, label, short, bitrateMbps: mbps, capMbps, crf,
      })),
    })),
    modes: Object.values(videoLib.MODES).map(({ key, label, desc, twoPass }) => ({ key, label, desc, twoPass })),
  });
});

app.get('/api/engine', (_req, res) => {
  res.json({
    engine: videoLib.ENGINE,
    caps: videoLib.CAPS,
    targets: Object.values(videoLib.TARGETS).map((t) => ({
      ...t,
      maxMB: videoLib.targetMaxMB(t),
      autoQuality: undefined,
    })),
    modes: Object.values(videoLib.MODES),
    limits: {
      maxUploadMB: config.MAX_UPLOAD_MB,
      maxOutputMB: config.MAX_OUTPUT_MB,
      statusMaxMB: config.STATUS_MAX_MB,
      statusMaxSec: config.STATUS_MAX_SEC,
    },
    mem: { limitMB: config.MEM.limitMB, lowMem: config.LOW_MEM },
  });
});

app.get('/api/status', (_req, res) => res.json(wa.status()));

app.post('/api/connect/qr', async (_req, res) => {
  try {
    res.json(await wa.requestQR());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/connect/pairing', async (req, res) => {
  try {
    const info = await wa.requestPairing(req.body?.number);
    res.json(info);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.post('/api/connect/pairing/refresh', async (req, res) => {
  try {
    const number = req.body?.number || wa.pairingNumber;
    if (!number) throw new Error('Nomor WA-nya belum diisi.');
    const info = await wa.requestPairing(number, { refresh: true });
    res.json(info);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.post('/api/connect/pairing/cancel', async (_req, res) => {
  try {
    wa.cancelPairing();
    wa.setState('idle');
    await wa.requestQR();
    res.json({ ok: true, ...wa.status() });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.post('/api/disconnect', async (_req, res) => {
  await wa.disconnect();
  res.json({ ok: true });
});

app.post('/api/logout', async (_req, res) => {
  await wa.logout();
  res.json({ ok: true });
});

app.post('/api/upload', (req, res) => {
  uploadMw(req, res, async (err) => {
    if (err) {
      const msg = err.code === 'LIMIT_FILE_SIZE'
        ? `Ukuran videonya melebihi ${config.MAX_UPLOAD_MB} MB.`
        : err.message || 'Upload gagal.';
      return res.status(400).json({ error: msg });
    }
    if (!req.file) return res.status(400).json({ error: 'Belum ada file yang di-upload.' });

    try {
      const meta = videoLib.extractMeta(await videoLib.probe(req.file.path));
      if (!meta.width || !meta.height || !meta.durationSec) {
        videoLib.rm(req.file.path);
        return res.status(400).json({ error: 'File-nya gak kebaca sebagai video. Pakai MP4/MOV/MKV/AVI/WebM/3GP ya.' });
      }
      if (meta.durationSec > 60 * 30) {
        videoLib.rm(req.file.path);
        return res.status(400).json({ error: 'Durasi maksimal 30 menit ya.' });
      }
      const uploadId = crypto.randomBytes(8).toString('hex');
      uploads.set(uploadId, {
        file: req.file.path,
        originalName: req.file.originalname || 'video.mp4',
        sizeBytes: req.file.size,
        uploadedAt: Date.now(),
        ...meta,
      });

      // Plan default (target dari field upload / env) + plan per pilihan resolusi
      const target = videoLib.getTarget(req.body?.target || config.DEFAULT_TARGET);
      const baseOpts = engineOptions({ target: target.key, mode: config.ENGINE_MODE });
      const plans = {};
      for (const rung of target.ladder) {
        plans[rung.key] = videoLib.plan(meta, { ...baseOpts, quality: rung.key });
      }
      res.json({
        uploadId,
        plan: videoLib.plan(meta, baseOpts),
        plans,
        target: target.key,
        targets: Object.values(videoLib.TARGETS).map((t) => ({ key: t.key, label: t.label, short: t.short })),
        meta: {
          originalName: req.file.originalname,
          sizeMB: +(req.file.size / 1048576).toFixed(2),
          durationSec: Math.round(meta.durationSec * 10) / 10,
          width: meta.width,
          height: meta.height,
          fps: meta.fps,
          isHDR: meta.isHDR,
          isVFR: meta.isVFR,
          codec: meta.vCodec,
        },
      });
    } catch (e) {
      videoLib.rm(req.file.path);
      res.status(400).json({ error: 'File-nya gak valid sebagai video.' });
    }
  });
});

/**
 * Preview rencana encode sesuai pilihan user di UI — resolusi, bitrate,
 * estimasi ukuran, filter, loudness — per TARGET PLATFORM.
 * Dipanggil tiap user ganti target/kualitas/mode/trim sebelum kirim.
 */
app.post('/api/plan', express.json(), async (req, res) => {
  try {
    const { uploadId, target, quality, mode, trim, trimStartSec, sharpen, denoise } = req.body || {};
    const meta = await probeUpload(uploadId);
    const opts = engineOptions({ target, quality, mode, trim, trimStartSec, sharpen, denoise });
    const tgt = videoLib.getTarget(opts.target);
    const plans = {};
    for (const rung of tgt.ladder) {
      plans[rung.key] = videoLib.plan(meta, { ...opts, quality: rung.key });
    }
    const plan = videoLib.plan(meta, opts);
    res.json({ plan, plans, target: tgt.key, targets: Object.values(videoLib.TARGETS).map((t) => ({ key: t.key, label: t.label, short: t.short })) });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.get('/api/history', (_req, res) => res.json(historyStore.list()));

app.delete('/api/history/:id', (req, res) => {
  historyStore.remove(req.params.id);
  io.emit('history:update', historyStore.list());
  res.json({ ok: true });
});

app.delete('/api/history', (_req, res) => {
  historyStore.clear();
  io.emit('history:update', historyStore.list());
  res.json({ ok: true });
});

app.get('/api/thumb/:id', (req, res) => {
  const entry = historyStore.get(req.params.id);
  if (!entry || !entry.thumbFile) return res.status(404).end();
  const f = path.join(config.VIDEOS_DIR, entry.thumbFile);
  if (!fs.existsSync(f)) return res.status(404).end();
  res.setHeader('Cache-Control', 'public, max-age=3600');
  res.sendFile(f);
});

/** Unduh video hasil kompres (HD) langsung dari server */
app.get('/api/download/:id', (req, res) => {
  const entry = historyStore.get(req.params.id);
  if (!entry || !entry.videoFile) {
    log.warn(`Download miss: riwayat ${req.params.id} tidak ditemukan (server restart? volume belum dipasang?).`);
    return res.status(404).json({ error: 'Riwayatnya gak ketemu — kalau server sempat restart, file di filesystem sementara bisa hilang. Pasang Volume /data di Railway biar file & riwayat bertahan. Proses ulang videonya ya.' });
  }
  const f = path.join(config.VIDEOS_DIR, entry.videoFile);
  if (!fs.existsSync(f)) {
    log.warn(`Download miss: file ${entry.videoFile} tidak ada di ${config.VIDEOS_DIR} (volume/restart?).`);
    return res.status(404).json({ error: 'File videonya udah gak ada di storage server (biasanya karena container restart tanpa Volume). Pasang Volume /data di Railway, lalu proses ulang videonya.' });
  }
  const base = String(entry.originalName || 'video').replace(/\.[^.]+$/, '').replace(/[^\w\-. ]+/g, '');
  const name = `${base || 'video'}-${entry.resolution || 'HD'}-HD-Jir.mp4`;
  res.download(f, name);
});

/* ============================================================
 * Socket.io
 * ============================================================ */
io.on('connection', (socket) => {
  log.info(`Client terhubung: ${socket.id}`);
  socket.emit('conn:update', wa.status());
  socket.emit('history:update', historyStore.list());
  if (wa.pairingInfo()?.active) socket.emit('pairing:code', wa.pairingInfo());

  socket.on('video:process', (p) => runProcess(socket, p || {}));
  socket.on('video:resend', (p) => runProcess(socket, { ...(p || {}), resendId: p?.id || p?.resendId }));
  socket.on('video:cancel', () => {
    try { if (activeJob.cancel) activeJob.cancel(); } catch (_) { /* noop */ }
  });
  socket.on('history:get', () => socket.emit('history:update', historyStore.list()));
  socket.on('history:delete', (id) => {
    historyStore.remove(id);
    io.emit('history:update', historyStore.list());
  });
  socket.on('disconnect', () => log.info(`Client putus: ${socket.id}`));
});

/* ============================================================
 * Static frontend (production) + SPA fallback
 * ============================================================ */
const DIST = path.join(config.ROOT, 'client', 'dist');
if (fs.existsSync(DIST)) {
  app.use(
    express.static(DIST, {
      setHeaders: (res, filePath) => {
        if (/\/assets\//.test(filePath)) res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
        else if (/manifest|\.png|\.svg|\.ico/.test(filePath)) res.setHeader('Cache-Control', 'public, max-age=86400');
      },
    })
  );
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api') || req.path.startsWith('/socket.io')) return next();
    res.sendFile(path.join(DIST, 'index.html'));
  });
}

/* ============================================================
 * Cleanup berkala: file upload basi & prune video lama
 * ============================================================ */
function sweep() {
  const now = Date.now();
  for (const [id, m] of uploads) {
    if (now - m.uploadedAt > config.UPLOAD_TTL_MS) {
      videoLib.rm(m.file);
      uploads.delete(id);
    }
  }
  const list = historyStore.list();
  const kept = new Set();
  for (const e of list) {
    if (e.status === 'success' && e.videoFile) {
      if (kept.size < config.KEEP_VIDEOS * 2) {
        kept.add(e.videoFile);
        if (e.thumbFile) kept.add(e.thumbFile);
      }
    }
  }
  try {
    for (const f of fs.readdirSync(config.VIDEOS_DIR)) {
      if (!kept.has(f)) videoLib.rm(path.join(config.VIDEOS_DIR, f));
    }
  } catch (_) { /* noop */ }
  try {
    for (const f of fs.readdirSync(config.UPLOAD_DIR)) {
      const p = path.join(config.UPLOAD_DIR, f);
      const st = fs.statSync(p);
      if (now - st.mtimeMs > config.UPLOAD_TTL_MS) videoLib.rm(p);
    }
  } catch (_) { /* noop */ }
}
setInterval(sweep, 10 * 60 * 1000).unref?.();
setInterval(() => {
  // Jaga koneksi WA tetap hidup walau idle lama (penting di Railway)
  if (wa.state === 'idle' && !config.MOCK_SEND) wa.start().catch(() => {});
}, 15 * 60 * 1000).unref?.();

/* ============================================================
 * Startup & shutdown
 * ============================================================ */
async function start() {
  return new Promise((resolve) => {
    httpServer.listen(config.PORT, '0.0.0.0', () => {
      log.info(`⚡ ${config.APP_NAME} v${config.VERSION} (by ${config.BRAND}) jalan di :${config.PORT}`);
      log.info(`   Data dir : ${config.DATA_DIR}`);
      log.info(`   Engine   : ${videoLib.ENGINE.name} v${videoLib.ENGINE.version} · mode default ${config.ENGINE_MODE}`);
      if (config.MOCK_SEND) log.warn('   ⚠ MOCK_SEND aktif — koneksi WhatsApp di-simulasikan!');
      if (config.APP_KEY) log.info('   App Key  : aktif');
      resolve();
    });
    // Mulai koneksi WhatsApp (session persistent langsung open kalau masih valid)
    setTimeout(() => wa.start().catch((e) => log.error('Start WhatsApp gagal:', e.message)), 300);
    sweep();
  });
}

function shutdown(signal) {
  log.warn(`${signal} diterima — shutdown bersih...`);
  wa.shutdown().finally(() => {
    httpServer.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 3000).unref();
  });
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('unhandledRejection', (e) => log.error('Unhandled rejection:', e?.message || e));
process.on('uncaughtException', (e) => log.error('Uncaught exception:', e?.message || e));

if (require.main === module) {
  start();
}

module.exports = { app, httpServer, io, start, wa, runProcess };
