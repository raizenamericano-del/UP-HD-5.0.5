import { useApp } from '../App.jsx';
import Logo from './Logo.jsx';

export default function Footer() {
  const { cfg } = useApp();
  return (
    <footer className="relative z-10 border-t border-line py-6">
      <div className="mx-auto flex w-full max-w-4xl flex-col items-center gap-3 px-4 text-center sm:px-6">
        <Logo size={34} showText={false} />
        <div className="font-display text-sm font-bold text-white">
          ALL VD <span className="grad-text">HD</span>
        </div>
        <div className="text-xs text-slate-500">
          Dibuat dengan <span className="text-brand"></span> secangkir kopi oleh{' '}
          <span className="font-semibold text-slate-300">[Rifky]</span> ·{' '}
          <span className="text-slate-400">v{cfg?.version || '5.0.0'}</span>
        </div>
        <div className="max-w-xl text-[10px] leading-relaxed text-slate-600">
          ⚠ Pakai nomor sekunder ya — library tidak resmi (Baileys) berisiko membuat nomor
          dibatasi. Gunakan dengan bijak & patuhi ToS WhatsApp. Video yang dikirim bukan karya [Rifky].
        </div>
      </div>
    </footer>
  );
}
