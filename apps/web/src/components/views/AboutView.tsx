import { motion } from 'framer-motion';
import { ArrowLeft } from 'lucide-react';
import type { SideMenuContext } from './types';

interface AboutViewProps {
  ctx: SideMenuContext;
}

export default function AboutView({ ctx }: AboutViewProps) {
  const { t, changeView } = ctx;

  return (
    <motion.div key="about" className="flex flex-col h-full" initial={{ x: 100, opacity: 0 }} animate={{ x: 0, opacity: 1 }} exit={{ x: 100, opacity: 0 }} transition={{ duration: 0.2 }}>
      <div className="h-14 flex items-center gap-3 px-4 border-b border-border flex-shrink-0">
        <button onClick={() => changeView('main')} className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-white/10 transition-colors">
          <ArrowLeft size={20} />
        </button>
        <h3 className="text-sm font-semibold text-white flex-1">{t('aboutApp')}</h3>
      </div>
      <div className="flex-1 flex flex-col items-center justify-center p-8 text-center">
        <img src="/logo.png" alt="Vortex" className="w-20 h-20 rounded-2xl object-cover mb-4 ring-2 ring-white/10" />
        <h2 className="text-xl font-bold gradient-text mb-1">Talk Messenger</h2>
        <p className="text-sm text-zinc-400 mb-6">{t('version')} 1.0.0</p>
        <div className="text-xs text-zinc-500 space-y-1">
          <p>{t('modernMessenger')}</p>
          <p>{t('onPrivacy')}</p>
          <p className="mt-4 text-zinc-600">© 2026 Talk Team</p>
        </div>
      </div>
    </motion.div>
  );
}
