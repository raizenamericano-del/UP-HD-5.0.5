// Helper localStorage — preferensi user yang disimpan lokal

const KEYS = {
  target: 'hdjir_default_target',
  caption: 'hdjir_default_caption',
  key: 'hdjir_key',
  page: 'hdjir_page',
  quality: 'hdjir_quality',
  mode: 'hdjir_mode',
  trim: 'hdjir_trim',
  sharpen: 'hdjir_sharpen',
  platform: 'hdjir_platform',
};

const safe = {
  get: (k) => { try { return localStorage.getItem(k); } catch { return null; } },
  set: (k, v) => { try { localStorage.setItem(k, v); } catch { /* ignore */ } },
  del: (k) => { try { localStorage.removeItem(k); } catch { /* ignore */ } },
};

export const store = {
  getTarget: () => safe.get(KEYS.target) || '',
  setTarget: (v) => safe.set(KEYS.target, v || ''),
  getCaption: () => safe.get(KEYS.caption) || '',
  setCaption: (v) => safe.set(KEYS.caption, v || ''),
  getQuality: () => safe.get(KEYS.quality) || 'auto',
  setQuality: (v) => safe.set(KEYS.quality, v || 'auto'),
  getMode: () => safe.get(KEYS.mode) || 'balanced',
  setMode: (v) => safe.set(KEYS.mode, v || 'balanced'),
  getTrim: () => safe.get(KEYS.trim) !== '0', // default ON (auto-trim per target)
  setTrim: (v) => safe.set(KEYS.trim, v ? '1' : '0'),
  getSharpen: () => safe.get(KEYS.sharpen) === '1',
  setSharpen: (v) => safe.set(KEYS.sharpen, v ? '1' : '0'),
  getPlatform: () => safe.get(KEYS.platform) || 'wa',
  setPlatform: (v) => safe.set(KEYS.platform, v || 'wa'),
  getKey: () => safe.get(KEYS.key) || '',
  setKey: (v) => (v ? safe.set(KEYS.key, v) : safe.del(KEYS.key)),
  getPage: () => safe.get(KEYS.page) || 'connect',
  setPage: (v) => safe.set(KEYS.page, v),
  clear: () => [KEYS.target, KEYS.caption, KEYS.key, KEYS.page, KEYS.quality, KEYS.mode, KEYS.trim, KEYS.sharpen, KEYS.platform].forEach(safe.del),
};

export const fmtBytes = (bytes) => {
  if (!bytes && bytes !== 0) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1048576).toFixed(1)} MB`;
};

export const fmtDuration = (sec) => {
  sec = Math.round(sec || 0);
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
};

export const fmtEta = (sec) => {
  if (sec == null || !isFinite(sec)) return '…';
  if (sec < 60) return `${Math.ceil(sec)} dtk`;
  return `${Math.floor(sec / 60)} mnt ${Math.ceil(sec % 60)} dtk`;
};

export const fmtDate = (iso) => {
  try {
    return new Date(iso).toLocaleString('id-ID', {
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
};

/** Format nomor WA: 6281234567890 → +62 812-3456-7890 */
export const fmtPhone = (num) => {
  const n = String(num || '').replace(/\D/g, '');
  if (n.length < 10) return num || '';
  return `+${n.slice(0, 2)} ${n.slice(2, 5)}-${n.slice(5, 9)}-${n.slice(9)}`;
};
