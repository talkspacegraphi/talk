import { useState } from 'react';
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  Sparkles,
} from 'lucide-react';
import { useThemeStore } from '../../stores/themeStore';
import { themeCards } from './types';
import type { SideMenuContext } from './types';

interface ThemesViewProps {
  ctx: SideMenuContext;
}

export default function ThemesView({ ctx }: ThemesViewProps) {
  const { t, lang, changeView } = ctx;
  const { chatTheme, setChatTheme, appFont } = useThemeStore();
  const [themeIndex, setThemeIndex] = useState(() => {
    const idx = themeCards.findIndex(tc => tc.id === chatTheme);
    return idx >= 0 ? idx : 0;
  });

  const currentCard = themeCards[themeIndex];
  const isActive = chatTheme === currentCard.id;

  return (
    <div className="flex flex-col h-full">
      <div className="h-14 flex items-center gap-3 px-4 border-b border-border flex-shrink-0">
        <button onClick={() => changeView('settings')} className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-white/10 transition-colors">
          <ArrowLeft size={20} />
        </button>
        <h3 className="text-sm font-semibold text-white flex-1">{t('theme')}</h3>
        <span className="text-xs text-zinc-500 tabular-nums">{themeIndex + 1} / {themeCards.length}</span>
      </div>

      <div className="flex-1 flex flex-col items-center justify-center px-5 py-4 gap-4 overflow-hidden">
        {/* Preview card */}
        <div key={currentCard.id} className="w-full rounded-2xl overflow-hidden border border-border/40 shadow-xl flex flex-col" style={{ minHeight: 200 }}>
            <div
              className={`relative w-full h-32 chat-theme-${currentCard.id}`}
              style={currentCard.gradient ? { background: currentCard.gradient } : { backgroundColor: currentCard.color }}
            >
              <div className="absolute inset-0 p-4 flex flex-col justify-end gap-2">
                <div className="self-start max-w-[65%] px-3 py-2 rounded-2xl rounded-bl-md bg-white/10 backdrop-blur-sm">
                  <p className="text-[11px] text-white/70">Здарова! Как дела? 👋</p>
                </div>
                <div className="self-end max-w-[65%] px-3 py-2 rounded-2xl rounded-br-md" style={{ backgroundColor: currentCard.accent + '40' }}>
                  <p className="text-[11px] text-white/80">Все четко! ✨</p>
                </div>
              </div>
              {currentCard.animated && (
                <div className="absolute top-3 right-3 flex items-center gap-1 px-2 py-0.5 rounded-full bg-white/10 backdrop-blur-sm">
                  <Sparkles size={10} className="text-yellow-400" />
                  <span className="text-[9px] text-white/60 font-medium">{lang === 'ru' ? 'Интерактив' : 'Interactive'}</span>
                </div>
              )}
            </div>
            <div className="p-4 bg-surface-secondary">
              <div className="flex items-center gap-3 mb-1">
                <div className="w-3 h-3 rounded-full" style={{ backgroundColor: currentCard.accent }} />
                <h3 className="text-base font-bold text-white">{lang === 'ru' ? currentCard.name : currentCard.nameEn}</h3>
              </div>
              <p className="text-xs text-zinc-400 ml-6">{lang === 'ru' ? currentCard.desc : currentCard.descEn}</p>
            </div>
          </div>

        {/* Navigation arrows + select */}
        <div className="flex items-center gap-3 w-full">
          <button
            onClick={() => setThemeIndex(i => (i - 1 + themeCards.length) % themeCards.length)}
            className="p-2.5 rounded-xl bg-surface-tertiary/60 text-zinc-400 hover:text-white hover:bg-surface-hover transition-colors"
          >
            <ChevronLeft size={20} />
          </button>
          <button
            onClick={() => { setChatTheme(currentCard.id); }}
            className={`flex-1 py-3 rounded-xl text-sm font-semibold transition-all duration-200 ${isActive
              ? 'bg-accent/20 text-accent ring-1 ring-accent/40 cursor-default'
              : 'bg-accent text-white hover:bg-accent/90 shadow-lg shadow-accent/20'
              }`}
            disabled={isActive}
          >
            {isActive ? (lang === 'ru' ? '✓ Выбрано' : '✓ Selected') : (lang === 'ru' ? 'Применить' : 'Apply')}
          </button>
          <button
            onClick={() => setThemeIndex(i => (i + 1) % themeCards.length)}
            className="p-2.5 rounded-xl bg-surface-tertiary/60 text-zinc-400 hover:text-white hover:bg-surface-hover transition-colors"
          >
            <ChevronRight size={20} />
          </button>
        </div>

        {/* Dot indicators */}
        <div className="flex items-center gap-1.5">
          {themeCards.map((tc, i) => (
            <button
              key={tc.id}
              onClick={() => setThemeIndex(i)}
              className={`rounded-full transition-all duration-200 ${i === themeIndex
                ? 'w-6 h-2 bg-accent'
                : chatTheme === tc.id
                  ? 'w-2 h-2 bg-accent/50'
                  : 'w-2 h-2 bg-zinc-600 hover:bg-zinc-500'
                }`}
            />
          ))}
        </div>

        {/* Font selector */}
        <div className="w-full mt-2">
          <h4 className="text-xs text-zinc-500 uppercase tracking-wide mb-3 px-1">{t('font')}</h4>
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => useThemeStore.getState().setAppFont('default')}
              className={`px-4 py-3 rounded-xl transition-all ${appFont === 'default' ? 'bg-vortex-500/15 ring-1 ring-vortex-500/30' : 'bg-surface-tertiary/50 hover:bg-surface-hover'}`}
            >
              <p className="text-sm text-zinc-200 font-medium" style={{ fontFamily: 'Inter, system-ui, sans-serif' }}>{t('fontDefault')}</p>
            </button>
            <button
              onClick={() => useThemeStore.getState().setAppFont('rounded')}
              className={`px-4 py-3 rounded-xl transition-all ${appFont === 'rounded' ? 'bg-vortex-500/15 ring-1 ring-vortex-500/30' : 'bg-surface-tertiary/50 hover:bg-surface-hover'}`}
            >
              <p className="text-sm text-zinc-200 font-medium" style={{ fontFamily: 'Nunito, system-ui, sans-serif' }}>{t('fontRounded')}</p>
            </button>
            <button
              onClick={() => useThemeStore.getState().setAppFont('mono')}
              className={`px-4 py-3 rounded-xl transition-all ${appFont === 'mono' ? 'bg-vortex-500/15 ring-1 ring-vortex-500/30' : 'bg-surface-tertiary/50 hover:bg-surface-hover'}`}
            >
              <p className="text-sm text-zinc-200 font-medium" style={{ fontFamily: 'JetBrains Mono, monospace' }}>{t('fontMono')}</p>
            </button>
            <button
              onClick={() => useThemeStore.getState().setAppFont('serif')}
              className={`px-4 py-3 rounded-xl transition-all ${appFont === 'serif' ? 'bg-vortex-500/15 ring-1 ring-vortex-500/30' : 'bg-surface-tertiary/50 hover:bg-surface-hover'}`}
            >
              <p className="text-sm text-zinc-200 font-medium" style={{ fontFamily: 'Merriweather, Georgia, serif' }}>{t('fontSerif')}</p>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
