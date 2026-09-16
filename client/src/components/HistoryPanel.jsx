import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { CheckCircle2, Clock, Download, History, Loader2, RefreshCw, Trash2, XCircle } from 'lucide-react';
import { useApp } from '../App.jsx';
import { api } from '../lib/api.js';
import { fmtDate, fmtDuration } from '../lib/store.js';

/** Riwayat pengiriman — bisa kirim ulang / unduh versi HD */
export default function HistoryPanel({ onResend, busy }) {
  const { history, addToast } = useApp();
  const [resendingId, setResendingId] = useState(null);
  const [confirmClear, setConfirmClear] = useState(false);
  const [filter, setFilter] = useState('all');

  if (!history.length) return null;

  const filtered = history.filter((h) => (filter === 'all' ? true : h.status === filter));

  const handleResend = (entry) => {
    if (busy) {
      addToast('warn', 'Lagi sibuk', 'Masih ada proses jalan. Tunggu selesai dulu ya.');
      return;
    }
    setResendingId(entry.id);
    setTimeout(() => {
      setResendingId(null);
      onResend(entry);
    }, 500);
  };

  const handleDelete = async (id) => {
    try {
      await api(`/api/history/${id}`, { method: 'DELETE' });
      addToast('info', 'Dihapus', 'Riwayat udah dihapus.');
    } catch (err) {
      addToast('error', 'Gagal', err.message);
    }
  };

  const handleClearAll = async () => {
    if (!confirmClear) {
      setConfirmClear(true);
      setTimeout(() => setConfirmClear(false), 3000);
      return;
    }
    try {
      await api('/api/history', { method: 'DELETE' });
      addToast('info', 'Riwayat dibersihin', '');
    } catch (err) {
      addToast('error', 'Gagal', err.message);
    }
  };

  return (
    <div className="card p-5 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <History className="h-4 w-4 text-cyan-300" />
          <h3 className="text-sm font-extrabold text-white">Riwayat Kiriman</h3>
          <span className="chip">{history.length}</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="seg !p-0.5">
            {[
              { id: 'all', label: 'Semua' },
              { id: 'success', label: 'Sukses' },
              { id: 'failed', label: 'Gagal' },
            ].map((f) => (
              <button
                key={f.id}
                onClick={() => setFilter(f.id)}
                className={`rounded-lg px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider transition ${
                  filter === f.id ? 'bg-white/10 text-white' : 'text-slate-500 hover:text-slate-300'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
          <button onClick={handleClearAll} className="text-[11px] font-semibold text-slate-500 transition hover:text-red-400">
            {confirmClear ? 'Yakin? klik lagi' : 'Bersihin'}
          </button>
        </div>
      </div>

      <div className="mt-4 space-y-2.5">
        <AnimatePresence initial={false}>
          {filtered.map((h) => (
            <motion.div
              key={h.id}
              layout
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, x: -26 }}
              transition={{ type: 'spring', stiffness: 380, damping: 30 }}
              className="flex items-center gap-3 rounded-xl border border-white/[0.07] bg-white/[0.025] p-3 transition-colors hover:border-brand/25"
            >
              {/* thumb */}
              {h.thumbFile ? (
                <img src={`/api/thumb/${h.id}`} alt="" className="h-14 w-14 shrink-0 rounded-lg object-cover" loading="lazy" />
              ) : (
                <div className="grid h-14 w-14 shrink-0 place-items-center rounded-lg bg-white/[0.05] text-slate-600">
                  <Clock className="h-5 w-5" />
                </div>
              )}

              {/* info */}
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="truncate text-xs font-bold text-white">{h.originalName}</span>
                  {h.status === 'success' ? <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-accent" /> : <XCircle className="h-3.5 w-3.5 shrink-0 text-red-400" />}
                  {h.source === 'resend' && <span className="chip chip-brand shrink-0">ulang</span>}
                  {h.platformLabel && <span className="chip chip-iris shrink-0">{h.platformLabel}</span>}
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10px] text-slate-500">
                  <span className="font-mono text-accent/90">
                    → {h.target || '—'}{h.targets?.length > 1 ? ` +${h.targets.length - 1}` : ''}
                  </span>
                  {h.status === 'success' && (
                    <>
                      <span>·</span><span>{h.resolution}</span>
                      <span>·</span><span>{fmtDuration(h.durationSec)}</span>
                      <span>·</span><span>{h.sizeMB} MB</span>
                      {h.mode && <><span>·</span><span className="uppercase">{h.mode}</span></>}
                      {h.trimmed && <><span>·</span><span className="text-amber-400">trim30</span></>}
                    </>
                  )}
                  <span>·</span><span>{fmtDate(h.createdAt)}</span>
                </div>
                {h.status === 'failed' && h.error && <div className="mt-0.5 truncate text-[10px] text-red-400/80">{h.error}</div>}
              </div>

              {/* aksi */}
              <div className="flex shrink-0 items-center gap-1">
                {h.status === 'success' && (
                  <>
                    <a
                      className="btn-ghost !px-2.5 !py-1.5 text-[11px]"
                      href={`/api/download/${h.id}`}
                      download
                      title="Unduh versi HD"
                    >
                      <Download className="h-3.5 w-3.5" />
                    </a>
                    <button
                      onClick={() => handleResend(h)}
                      disabled={busy || resendingId === h.id}
                      className="btn-ghost !px-2.5 !py-1.5 text-[11px]"
                      title="Kirim ulang video ini"
                    >
                      {resendingId === h.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                      <span className="hidden sm:inline">Ulang</span>
                    </button>
                  </>
                )}
                <button
                  onClick={() => handleDelete(h.id)}
                  className="rounded-lg p-2 text-slate-500 transition hover:bg-red-400/10 hover:text-red-400"
                  title="Hapus riwayat"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      {filtered.length === 0 && <div className="py-6 text-center text-xs text-slate-500">Belum ada riwayat di filter ini.</div>}
    </div>
  );
}
