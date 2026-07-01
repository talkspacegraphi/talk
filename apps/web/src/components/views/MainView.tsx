import {
  User,
  Users,
  Settings,
  Info,
  LogOut,
  AtSign,
  ChevronRight,
  Mic,
} from 'lucide-react';
import type { SideMenuContext } from './types';

interface MainViewProps {
  ctx: SideMenuContext;
  friendRequestCount: number;
}

export default function MainView({ ctx, friendRequestCount }: MainViewProps) {
  const { user, t, changeView, onClose, handleLogout } = ctx;

  const initials = (user?.displayName || user?.username || '??')
    .split(' ')
    .map((w: string) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  const menuItems = [
    { icon: User, label: t('myProfile'), onClick: () => changeView('profile') },
    { icon: Users, label: t('friends'), onClick: () => changeView('friends'), badge: friendRequestCount > 0 ? friendRequestCount : undefined },
    { icon: Settings, label: t('settings'), onClick: () => changeView('settings') },
    { icon: Mic, label: t('voiceAndVideo'), onClick: () => changeView('audio') },
    { divider: true },
    { icon: Info, label: t('aboutApp'), subtitle: 'Talk Messenger v1.0', onClick: () => changeView('about') },
  ];

  return (
    <div className="flex flex-col h-full">
      {/* Premium header with avatar */}
      <div className="relative overflow-hidden flex-shrink-0">
        <div className="absolute inset-0 bg-gradient-to-br from-vortex-500/40 via-purple-600/25 to-transparent pointer-events-none" />
        <div className="absolute -top-20 -right-20 w-56 h-56 bg-vortex-500/15 rounded-full blur-[80px] pointer-events-none" />
        <div className="absolute -bottom-10 -left-10 w-40 h-40 bg-purple-600/10 rounded-full blur-[60px] pointer-events-none" />

        <div className="relative p-6 pb-5">
          <div className="flex items-start justify-between mb-5">
            <div className="relative group cursor-pointer" onClick={() => changeView('profile')}>
              <div className="absolute -inset-1 bg-gradient-to-r from-accent via-purple-500 to-accent rounded-full opacity-60 blur group-hover:opacity-90 transition duration-500 animate-[spin_4s_linear_infinite]" />
              <div className="relative">
                {user?.avatar ? (
                  <img src={user.avatar} alt="" className="w-[72px] h-[72px] rounded-full object-cover ring-[3px] ring-surface" />
                ) : (
                  <div className="w-[72px] h-[72px] rounded-full bg-gradient-to-br from-surface to-surface-secondary flex items-center justify-center ring-[3px] ring-surface relative overflow-hidden">
                    <div className="absolute inset-0 bg-gradient-to-tr from-accent/20 to-purple-500/20" />
                    <span className="relative z-10 text-2xl font-bold text-transparent bg-clip-text bg-gradient-to-br from-white to-zinc-400 drop-shadow-md">{initials}</span>
                  </div>
                )}
              </div>
              <div className="absolute bottom-0 right-0 w-4 h-4 bg-emerald-500 rounded-full ring-[3px] ring-surface shadow-[0_0_8px_rgba(16,185,129,0.6)]" />
            </div>
            <button onClick={onClose} className="p-2 rounded-xl text-zinc-400 hover:text-white hover:bg-white/10 transition-all backdrop-blur-sm">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
            </button>
          </div>
          <h3 className="text-xl font-bold text-transparent bg-clip-text bg-gradient-to-b from-white to-white/70 tracking-tight leading-tight">
            {user?.displayName || user?.username}
          </h3>
          <div className="flex items-center gap-1.5 mt-1.5">
            <AtSign size={12} className="text-vortex-400" />
            <span className="text-sm font-medium text-vortex-100/70">{user?.username}</span>
          </div>
        </div>
        <div className="h-px bg-gradient-to-r from-transparent via-white/10 to-transparent" />
      </div>

      {/* Menu items */}
      <div className="flex-1 overflow-y-auto px-3 py-4 space-y-1">
        {menuItems.map((item, i) => {
          if ('divider' in item) return <div key={i} className="my-2 mx-2 h-px bg-gradient-to-r from-transparent via-white/8 to-transparent" />;
          const Icon = item.icon!;
          return (
            <button
              key={i}
              onClick={item.onClick}
              className="group w-full flex items-center gap-3.5 px-4 py-3 rounded-2xl text-left transition-all duration-200 hover:bg-white/[0.06] active:scale-[0.98]"
            >
              <div className="w-9 h-9 rounded-xl bg-white/[0.06] group-hover:bg-vortex-500/15 flex items-center justify-center transition-all duration-200 border border-white/[0.04] group-hover:border-vortex-500/20">
                <Icon size={17} className="text-zinc-400 group-hover:text-vortex-400 transition-colors duration-200" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[13.5px] font-medium text-zinc-200 group-hover:text-white transition-colors">{item.label}</p>
                {item.subtitle && <p className="text-[11px] text-zinc-500 mt-0.5">{item.subtitle}</p>}
              </div>
              {'badge' in item && item.badge ? (
                <span className="bg-gradient-to-r from-vortex-500 to-purple-600 text-white text-[11px] font-bold min-w-[22px] h-[22px] px-1.5 rounded-full flex items-center justify-center flex-shrink-0 shadow-[0_0_12px_rgba(168,85,247,0.4)]">
                  {item.badge}
                </span>
              ) : (
                <ChevronRight size={15} className="text-zinc-600 group-hover:text-zinc-400 transition-colors flex-shrink-0" />
              )}
            </button>
          );
        })}
      </div>

      {/* Logout button */}
      <div className="px-3 pb-4 pt-1">
        <div className="h-px bg-gradient-to-r from-transparent via-white/8 to-transparent mb-3" />
        <button
          onClick={handleLogout}
          className="group w-full flex items-center gap-3.5 px-4 py-3 rounded-2xl transition-all duration-200 hover:bg-red-500/[0.08] active:scale-[0.98]"
        >
          <div className="w-9 h-9 rounded-xl bg-red-500/[0.08] group-hover:bg-red-500/15 flex items-center justify-center transition-all duration-200 border border-red-500/[0.06] group-hover:border-red-500/20">
            <LogOut size={17} className="text-red-400/70 group-hover:text-red-400 transition-colors duration-200" />
          </div>
          <span className="text-[13.5px] font-medium text-red-400/70 group-hover:text-red-400 transition-colors">{t('logout')}</span>
        </button>
      </div>
    </div>
  );
}
