import { useState, useEffect } from 'react';
import { useAuthStore } from '../stores/authStore';
import { useChatStore } from '../stores/chatStore';
import { useLang } from '../lib/i18n';
import { api } from '../lib/api';
import { MainView, ProfileView, SettingsView, ThemesView, FriendsView, AudioView, AboutView } from './views';
import type { SideView, SideMenuContext } from './views/types';

interface SideMenuProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function SideMenu({ isOpen, onClose }: SideMenuProps) {
  const { user, updateUser } = useAuthStore();
  const clearStore = useChatStore((s) => s.clearStore);
  const { t, lang, setLang } = useLang();

  const [view, setView] = useState<SideView>('main');
  const [prevView, setPrevView] = useState<SideView>('main');
  const [friendRequestCount, setFriendRequestCount] = useState(0);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth <= 768);
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  useEffect(() => {
    if (!isOpen) {
      const timer = setTimeout(() => { setView('main'); setPrevView('main'); }, 300);
      return () => clearTimeout(timer);
    }
    api.getFriendRequests().then(reqs => setFriendRequestCount(reqs.length)).catch(() => {});
  }, [isOpen]);

  const changeView = (next: SideView) => {
    setPrevView(view);
    setView(next);
  };

  const handleLogout = () => {
    onClose();
    setTimeout(() => {
      clearStore();
      useAuthStore.getState().logout();
    }, 100);
  };

  const ctx: SideMenuContext = {
    user,
    updateUser,
    t: t as (key: string) => string,
    lang,
    setLang,
    changeView,
    onClose,
    handleLogout,
  };

  const renderView = () => {
    switch (view) {
      case 'main': return <MainView ctx={ctx} friendRequestCount={friendRequestCount} />;
      case 'profile': return <ProfileView ctx={ctx} />;
      case 'settings': return <SettingsView ctx={ctx} />;
      case 'themes': return <ThemesView ctx={ctx} />;
      case 'friends': return <FriendsView ctx={ctx} />;
      case 'audio': return <AudioView ctx={ctx} />;
      case 'about': return <AboutView ctx={ctx} />;
      default: return null;
    }
  };

  if (!isOpen) return null;

  return (
    <>
      <div
        className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[60] flex items-center justify-center p-0 md:p-4 animate-[fadeIn_200ms_ease-out]"
        onClick={onClose}
      />
      <div
        onClick={(e) => e.stopPropagation()}
        className={`fixed ${isMobile ? 'inset-0 animate-[slideInRight_200ms_ease-out]' : 'left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-lg rounded-3xl max-h-[90vh] animate-[scaleIn_200ms_ease-out]'} bg-[#18181b]/95 backdrop-blur-2xl shadow-2xl border-0 md:border md:border-border/50 z-[60] overflow-hidden flex flex-col`}
      >
        {renderView()}
      </div>
    </>
  );
}
