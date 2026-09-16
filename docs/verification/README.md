# Bukti Verifikasi — ALL VD HD v5 ("HD Jir")

Semua bukti di folder ini dihasilkan oleh skrip yang ikut di repo (bukan hasil rekayasa):

| File | Isi | Cara regenerate |
|---|---|---|
| `smoke.txt` | Output lengkap `npm run smoke` (43 assertion: branding, unit pairing, plan per target, endpoint `/api/plan`, encode nyata, pipeline socket, resend, multi-target) | `npm run smoke \| tee docs/verification/smoke.txt` |
| `bench.log` | Output lengkap `npm run bench` (tabel SSIM/PSNR/VMAF v4-lama vs v5 per target, setelah simulasi re-encode platform) | `npm run bench \| tee docs/verification/bench.log` |
| `bench-summary.json` | Ringkasan terstruktur hasil bench | dihasilkan otomatis oleh bench |
| `ffprobe-<case>.txt` | Bukti encode NYATA per kasus: plan engine + `ffprobe` hasil + loudness terukur (ebur128). Kasus: `portrait-tiktok`, `portrait-ig`, `4k-tiktok`, `4k-ig`, `hdr10-tiktok`, `hdr10-ig`, `4k-tiktok-2pass` | `node scripts/verify-encodes.js` |
| `encodes.json` | Ringkasan terstruktur semua kasus encode | dihasilkan otomatis oleh verify-encodes |

## Sumber uji

- `samples/sample_portrait_9x16.mp4` — portrait 720×1280 (ikut di repo)
- `samples/sample_1080p_12s.mp4`, `samples/sample_720p_40s.mp4` — sumber bench (ikut di repo)
- `/tmp/v5test/src_4k.mp4` — 3840×2160 30fps (dibuat dengan testsrc2; tidak ikut di repo karena besar)
- `/tmp/v5test/src_hdr10.mp4` — 1920×1080 10-bit, PQ (SMPTE 2084) + BT.2020 + mastering metadata (HDR10 asli)

Untuk regenerate sumber 4K/HDR lihat perintah di `scripts/verify-encodes.js` header, atau:

```bash
ffmpeg -f lavfi -i "testsrc2=size=3840x2160:rate=30:duration=8" -f lavfi -i "sine=frequency=520:duration=8" \
  -c:v libx264 -preset ultrafast -crf 20 -pix_fmt yuv420p -c:a aac -shortest -y /tmp/v5test/src_4k.mp4

ffmpeg -f lavfi -i "testsrc2=size=1920x1080:rate=30:duration=8" -f lavfi -i "sine=frequency=320:duration=8" \
  -c:v libx265 -preset veryfast -pix_fmt yuv420p10le -color_primaries bt2020 -color_trc smpte2084 \
  -colorspace bt2020nc -c:a aac -shortest -y /tmp/v5test/src_hdr10.mp4
```

## Yang TIDAK bisa diuji otomatis (jujur)

- **Pairing code end-to-end** butuh HP fisik dengan WhatsApp aktif — kode diterbitkan server WA
  ke flow "Tautkan dengan nomor telepon". Yang diuji: urutan handshake (socket open → QR
  pertama → requestPairingCode), suppress QR selama pairing, format 8 char lowercase, TTL,
  endpoint refresh/cancel, normalisasi nomor, penanganan stream error 515 (simulasi).
- **Kirim nyata ke WhatsApp** diuji dengan `MOCK_SEND=true` (pipeline socket lengkap sampai
  event `send:done`); pengiriman fisik butuh nomor ter-pairing.
- **`docker build`** tidak tersedia di sandbox verifikasi ini — Dockerfile ditulis multi-stage
  dan direview baris-per-baris, tapi build image-nya harus dijalankan di mesin deploy/CI kalian.
