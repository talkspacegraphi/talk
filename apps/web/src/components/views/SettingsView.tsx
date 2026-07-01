import {
  ArrowLeft,
  Check,
  Info,
  Palette,
  Eye,
} from 'lucide-react';
import { useAuthStore } from '../../stores/authStore';
import { useThemeStore } from '../../stores/themeStore';
import { api } from '../../lib/api';
import { themeCards } from './types';
import type { SideMenuContext, ThemeCard } from './types';

interface SettingsViewProps {
  ctx: SideMenuContext;
}

export default function SettingsView({ ctx }: SettingsViewProps) {
  const { t, lang, setLang, changeView } = ctx;
  const { chatTheme } = useThemeStore();

  const currentThemeCard = themeCards.find(tc => tc.id === chatTheme);

  return (
    <div className="flex flex-col h-full">
      <div className="h-14 flex items-center gap-3 px-4 border-b border-border flex-shrink-0">
        <button onClick={() => changeView('main')} className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-white/10 transition-colors">
          <ArrowLeft size={20} />
        </button>
        <h3 className="text-sm font-semibold text-white flex-1">{t('settings')}</h3>
      </div>
      <div className="flex-1 overflow-y-auto py-2">
        {/* Theme picker row */}
        <div className="px-4 py-1">
          <button
            onClick={() => changeView('themes')}
            className="w-full flex items-center gap-4 px-4 py-3.5 rounded-xl bg-surface-tertiary/50 hover:bg-surface-hover transition-colors group"
          >
            <div className="w-9 h-9 rounded-full flex items-center justify-center" style={{ backgroundColor: currentThemeCard?.accent || '#6366f1' }}>
              <Palette size={18} className="text-white" />
            </div>
            <div className="flex-1 min-w-0 text-left">
              <p className="text-sm font-medium text-zinc-200">{t('theme')}</p>
              <p className="text-xs text-zinc-500">{lang === 'ru' ? currentThemeCard?.name : currentThemeCard?.nameEn}</p>
            </div>
          </button>
        </div>
        <div className="px-5 py-3">
          <h4 className="text-xs text-zinc-500 uppercase tracking-wide mb-3">{t('language')}</h4>
          <div className="space-y-1">
            <button
              onClick={() => setLang('ru')}
              className={`w-full flex items-center gap-4 px-3 py-3 rounded-xl transition-colors ${lang === 'ru' ? 'bg-vortex-500/15 ring-1 ring-vortex-500/30' : 'bg-surface-tertiary/50 hover:bg-surface-hover'}`}
            >
              <span className="text-lg">🇷🇺</span>
              <div className="flex-1 min-w-0 text-left">
                <p className="text-sm text-zinc-200">Русский</p>
              </div>
              {lang === 'ru' && <Check size={16} className="text-vortex-400" />}
            </button>
            <button
              onClick={() => setLang('en')}
              className={`w-full flex items-center gap-4 px-3 py-3 rounded-xl transition-colors ${lang === 'en' ? 'bg-vortex-500/15 ring-1 ring-vortex-500/30' : 'bg-surface-tertiary/50 hover:bg-surface-hover'}`}
            >
              <span className="text-lg">🇬🇧</span>
              <div className="flex-1 min-w-0 text-left">
                <p className="text-sm text-zinc-200">English</p>
              </div>
              {lang === 'en' && <Check size={16} className="text-vortex-400" />}
            </button>
          </div>
        </div>
        {/* Privacy */}
        <div className="px-5 py-3">
          <h4 className="text-xs text-zinc-500 uppercase tracking-wide mb-3">{t('privacy')}</h4>
          <div className="space-y-1">
            <button
              onClick={async () => {
                const user = useAuthStore.getState().user;
                const newVal = !user?.hideStoryViews;
                try {
                  await api.updateSettings({ hideStoryViews: newVal });
                  useAuthStore.getState().updateUser({ hideStoryViews: newVal });
                } catch {}
              }}
              className="w-full flex items-center gap-4 px-3 py-3 rounded-xl bg-surface-tertiary/50 hover:bg-surface-hover transition-colors"
            >
              <Eye size={18} className="text-zinc-400 flex-shrink-0" />
              <div className="flex-1 min-w-0 text-left">
                <p className="text-sm text-zinc-200">{t('hideStoryViews')}</p>
                <p className="text-[11px] text-zinc-500 mt-0.5">{t('hideStoryViewsDesc')}</p>
              </div>
              <div className={`w-10 h-6 rounded-full transition-colors flex items-center px-0.5 ${useAuthStore.getState().user?.hideStoryViews ? 'bg-vortex-500' : 'bg-zinc-600'}`}>
                <div className={`w-5 h-5 rounded-full bg-white shadow transition-transform ${useAuthStore.getState().user?.hideStoryViews ? 'translate-x-4' : 'translate-x-0'}`} />
              </div>
            </button>
          </div>
        </div>
        <div className="px-5 py-3">
          <h4 className="text-xs text-zinc-500 uppercase tracking-wide mb-3">{t('about')}</h4>
          <div className="flex items-center gap-4 px-3 py-3 rounded-xl bg-surface-tertiary/50">
            <Info size={18} className="text-zinc-400" />
            <div className="flex-1 min-w-0">
              <p className="text-sm text-zinc-200">Talk Messenger</p>
              <p className="text-xs text-zinc-500">{t('version')} 1.0.0</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
