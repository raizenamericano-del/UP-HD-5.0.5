// Helper API — semua request ke backend (same-origin; di dev di-proxy Vite)
// ALL VD HD v5 by [Rifky]

const KEY = () => localStorage.getItem('hdjir_key') || '';

export class ApiError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

export async function api(path, opts = {}) {
  const headers = { ...(opts.headers || {}) };
  const key = KEY();
  if (key) headers['x-app-key'] = key;
  const res = await fetch(path, { cache: 'no-store', ...opts, headers });
  if (res.status === 401) throw new ApiError(401, 'App key salah');
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, data.error || 'Terjadi kesalahan');
  return data;
}

/** Upload video dengan progress (XHR). `target` = platform (wa/tiktok/ig/shorts/universal) */
export function uploadVideo(file, onProgress, target) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', '/api/upload');
    const key = KEY();
    if (key) xhr.setRequestHeader('x-app-key', key);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && onProgress) onProgress(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () => {
      try {
        const data = JSON.parse(xhr.responseText);
        if (xhr.status >= 200 && xhr.status < 300) resolve(data);
        else reject(new ApiError(xhr.status, data.error || 'Upload gagal'));
      } catch {
        reject(new Error('Upload gagal (respon tidak valid)'));
      }
    };
    xhr.onerror = () => reject(new Error('Upload gagal — periksa koneksi'));
    xhr.ontimeout = () => reject(new Error('Upload timeout'));
    xhr.timeout = 15 * 60 * 1000;
    const form = new FormData();
    form.append('video', file);
    if (target) form.append('target', target);
    xhr.send(form);
  });
}

/**
 * Unduh via fetch biar error server (JSON) bisa DITAMPILKAN sebagai pesan,
 * bukan disimpan browser sebagai file .json misterius.
 */
export async function downloadVideo(url, fallbackName = 'video-HD-Jir.mp4') {
  const res = await fetch(url, { cache: 'no-store' });
  const ctype = res.headers.get('content-type') || '';
  if (!res.ok || ctype.includes('json')) {
    let msg = `Download gagal (HTTP ${res.status}).`;
    try {
      const j = await res.json();
      if (j?.error) msg = j.error;
    } catch { /* noop */ }
    throw new Error(msg);
  }
  const blob = await res.blob();
  const disp = res.headers.get('content-disposition') || '';
  const m = disp.match(/filename="?([^";]+)"?/);
  const name = m?.[1] || fallbackName;
  const obj = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = obj;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(obj), 5000);
  return name;
}
