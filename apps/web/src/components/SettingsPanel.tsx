import { useState, useEffect } from 'react';
import {
  User,
  Users,
  Settings,
  Mic,
  Info,
  LogOut,
  Palette,
  Sparkles,
  ChevronRight,
  ArrowLeft,
} from 'lucide-react';
import { useAuthStore } from '../stores/authStore';
import { useChatStore } from '../stores/chatStore';
import { useThemeStore } from '../stores/themeStore';
import { useLang } from '../lib/i18n';
import { api } from '../lib/api';
import { ProfileView, SettingsView, ThemesView, FriendsView, AudioView, AboutView } from './views';
import type { SideView, SideMenuContext } from './views/types';

type NavItem = {
  id: SideView;
  icon: typeof User;
  label: string;
  badge?: number;
};

interface SettingsPanelProps {
  initialView?: 'main' | 'settings';
}

export default function SettingsPanel({ initialView }: SettingsPanelProps) {
  const { user, updateUser, logout } = useAuthStore();
  const clearStore = useChatStore(s => s.clearStore);
  const { chatTheme } = useThemeStore();
  const { t, lang, setLang } = useLang();

  const [activeView, setActiveView] = useState<SideView>(initialView || 'main');
  const [friendRequestCount, setFriendRequestCount] = useState(0);
  const [showCustomization, setShowCustomization] = useState(false);

  useEffect(() => {
    if (initialView) setActiveView(initialView);
  }, [initialView]);

  // Load friend request count
  useState(() => {
    api.getFriendRequests().then(reqs => setFriendRequestCount(reqs.length)).catch(() => {});
  });

  const handleLogout = () => {
    clearStore();
    logout();
  };

  const ctx: SideMenuContext = {
    user,
    updateUser,
    t: t as (key: string) => string,
    lang,
    setLang,
    changeView: setActiveView,
    onClose: () => setActiveView('main'),
    handleLogout,
  };

  const navItems: NavItem[] = [
    { id: 'main', icon: User, label: t('myProfile') },
    { id: 'friends', icon: Users, label: t('friends'), badge: friendRequestCount || undefined },
    { id: 'settings', icon: Settings, label: t('settings') },
    { id: 'audio', icon: Mic, label: t('voiceAndVideo') },
    { id: 'about', icon: Info, label: t('aboutApp') },
  ];

  const initials = (user?.displayName || user?.username || '??')
    .split(' ')
    .map((w: string) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  const renderContent = () => {
    switch (activeView) {
      case 'main': return <ProfileView ctx={ctx} />;
      case 'friends': return <FriendsView ctx={ctx} />;
      case 'settings': return <SettingsView ctx={ctx} />;
      case 'themes': return <ThemesView ctx={ctx} />;
      case 'audio': return <AudioView ctx={ctx} />;
      case 'about': return <AboutView ctx={ctx} />;
      default: return <ProfileView ctx={ctx} />;
    }
  };

  return (
    <div className="h-full flex flex-col bg-surface-secondary overflow-hidden">
      {/* Mobile: show nav list or content */}
      <div className="md:hidden flex-1 overflow-hidden relative">
        <div
          className="h-full transition-transform duration-200 ease-out"
          style={{ transform: activeView === 'main' ? 'translateX(0)' : 'translateX(-100%)' }}
        >
          {/* Mobile nav list */}
          <div className="h-full overflow-y-auto">
            {/* Profile header */}
            <div className="relative overflow-hidden">
              <div className="absolute inset-0 bg-gradient-to-br from-vortex-500/40 via-purple-600/25 to-transparent pointer-events-none" />
              <div className="relative p-6 pb-5">
                <div className="relative group cursor-pointer">
                  <div className="absolute -inset-1 bg-gradient-to-r from-accent via-purple-500 to-accent rounded-full opacity-60 blur group-hover:opacity-90 transition duration-500 animate-[spin_4s_linear_infinite]" />
                  <div className="relative">
                    {user?.avatar ? (
                      <img src={user.avatar} alt="" className="w-20 h-20 rounded-full object-cover ring-[3px] ring-surface" />
                    ) : (
                      <div className="w-20 h-20 rounded-full bg-gradient-to-br from-surface to-surface-secondary flex items-center justify-center ring-[3px] ring-surface relative overflow-hidden">
                        <span className="relative z-10 text-xl font-bold text-transparent bg-clip-text bg-gradient-to-br from-white to-zinc-400">{initials}</span>
                      </div>
                    )}
                  </div>
                  <div className="absolute bottom-0 right-0 w-3.5 h-3.5 bg-emerald-500 rounded-full ring-[3px] ring-surface" />
                </div>
                <h3 className="text-lg font-bold text-white mt-3">{user?.displayName || user?.username}</h3>
                <p className="text-sm text-zinc-400">@{user?.username}</p>
              </div>
              <div className="h-px bg-gradient-to-r from-transparent via-white/10 to-transparent" />
            </div>

            {/* Nav items */}
            <div className="px-3 py-3 space-y-1">
              {navItems.map((item) => {
                const Icon = item.icon;
                return (
                  <button
                    key={item.id}
                    onClick={() => setActiveView(item.id)}
                    className="group w-full flex items-center gap-3 px-4 py-3 rounded-2xl hover:bg-white/[0.06] transition-all duration-200 active:scale-[0.98]"
                  >
                    <div className="w-9 h-9 rounded-xl bg-white/[0.06] group-hover:bg-vortex-500/15 flex items-center justify-center transition-all duration-200 border border-white/[0.04] group-hover:border-vortex-500/20">
                      <Icon size={17} className="text-zinc-400 group-hover:text-vortex-400 transition-colors" />
                    </div>
                    <span className="flex-1 text-sm font-medium text-zinc-200 group-hover:text-white transition-colors text-left">{item.label}</span>
                    {item.badge ? (
                      <span className="bg-gradient-to-r from-vortex-500 to-purple-600 text-white text-[11px] font-bold min-w-[22px] h-[22px] px-1.5 rounded-full flex items-center justify-center">{item.badge}</span>
                    ) : (
                      <ChevronRight size={15} className="text-zinc-600 group-hover:text-zinc-400 transition-colors" />
                    )}
                  </button>
                );
              })}
            </div>

            <div className="px-5"><div className="h-px bg-gradient-to-r from-transparent via-white/8 to-transparent" /></div>

            {/* Logout */}
            <div className="px-3 py-3">
              <button
                onClick={handleLogout}
                className="group w-full flex items-center gap-3 px-4 py-3 rounded-2xl hover:bg-red-500/[0.08] transition-all duration-200 active:scale-[0.98]"
              >
                <div className="w-9 h-9 rounded-xl bg-red-500/[0.08] group-hover:bg-red-500/15 flex items-center justify-center transition-all duration-200 border border-red-500/[0.06] group-hover:border-red-500/20">
                  <LogOut size={17} className="text-red-400/70 group-hover:text-red-400 transition-colors" />
                </div>
                <span className="text-sm font-medium text-red-400/70 group-hover:text-red-400 transition-colors">{t('logout')}</span>
              </button>
            </div>
          </div>
        </div>

        {/* Content overlay for mobile */}
        <div
          className="absolute inset-0 bg-surface-secondary transition-transform duration-200 ease-out"
          style={{ transform: activeView === 'main' ? 'translateX(100%)' : 'translateX(0)' }}
        >
          {activeView !== 'main' && renderContent()}
        </div>
      </div>

      {/* Desktop: side nav + content */}
      <div className="hidden md:flex h-full overflow-hidden">
        {/* Nav sidebar */}
        <div className="w-56 flex-shrink-0 border-r border-border/40 flex flex-col bg-surface-secondary">
          {/* Profile header */}
          <div className="p-4 border-b border-border/40">
            <div className="flex items-center gap-3">
              <div className="relative">
                {user?.avatar ? (
                  <img src={user.avatar} alt="" className="w-10 h-10 rounded-full object-cover" />
                ) : (
                  <div className="w-10 h-10 rounded-full bg-gradient-to-br from-vortex-500 to-purple-600 flex items-center justify-center text-white text-xs font-bold">{initials}</div>
                )}
                <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-emerald-500 rounded-full ring-2 ring-surface-secondary" />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-white truncate">{user?.displayName || user?.username}</p>
                <p className="text-xs text-zinc-500 truncate">@{user?.username}</p>
              </div>
            </div>
          </div>

          {/* Nav items */}
          <div className="flex-1 overflow-y-auto px-2 py-2 space-y-0.5">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = activeView === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => setActiveView(item.id)}
                  className={`group w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all duration-200 ${
                    isActive
                      ? 'bg-vortex-500/15 text-vortex-400'
                      : 'text-zinc-400 hover:bg-white/[0.06] hover:text-zinc-200'
                  }`}
                >
                  <Icon size={18} className={isActive ? 'text-vortex-400' : 'text-zinc-500 group-hover:text-zinc-300 transition-colors'} />
                  <span className="flex-1 text-sm font-medium text-left">{item.label}</span>
                  {item.badge && (
                    <span className="bg-vortex-500 text-white text-[10px] font-bold min-w-[20px] h-[20px] px-1 rounded-full flex items-center justify-center">{item.badge}</span>
                  )}
                </button>
              );
            })}
          </div>

          {/* Logout */}
          <div className="px-2 pb-3 pt-1 border-t border-border/40">
            <button
              onClick={handleLogout}
              className="group w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-red-400/70 hover:bg-red-500/[0.08] hover:text-red-400 transition-all duration-200"
            >
              <LogOut size={18} />
              <span className="text-sm font-medium">{t('logout')}</span>
            </button>
          </div>
        </div>

        {/* Content area */}
        <div className="flex-1 overflow-hidden">
          {renderContent()}
        </div>
      </div>
    </div>
  );
}
