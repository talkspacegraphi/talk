import { useEffect } from 'react';
import { AnimatePresence } from 'framer-motion';
import { useAuthStore } from './stores/authStore';
import { useThemeStore } from './stores/themeStore';
import AuthPage from './pages/AuthPage';
import ChatPage from './pages/ChatPage';
import CustomTitleBar from './components/CustomTitleBar';

export default function App() {
  const { token, user, checkAuth, isLoading } = useAuthStore();
  const { appFont } = useThemeStore();

  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  useEffect(() => {
    document.body.className = `font-${appFont}`;
  }, [appFont]);

  // Electron titlebar takes 32px (h-8). On desktop Electron, push content down.
  useEffect(() => {
    const isElectron = !!(window as any).electronAPI;
    const isMobile = typeof window !== 'undefined' && window.innerWidth < 768;
    if (isElectron && !isMobile) {
      document.body.style.paddingTop = '32px';
    } else {
      document.body.style.paddingTop = '0px';
    }
  }, []);

  if (isLoading) {
    return (
      <div className="h-full flex items-center justify-center bg-surface">
        <div className="flex flex-col items-center gap-4">
          <VortexLoader />
          <p className="text-zinc-500 text-sm">Загрузка...</p>
        </div>
      </div>
    );
  }

  return (
    <>
      <CustomTitleBar />
      <AnimatePresence mode="wait">
        {token && user ? (
          <ChatPage key="chat" />
        ) : (
          <AuthPage key="auth" />
        )}
      </AnimatePresence>
    </>
  );
}

function VortexLoader() {
  return (
    <div className="relative w-12 h-12">
      <div className="absolute inset-0 rounded-full border-2 border-transparent border-t-vortex-500 animate-spin" />
      <div
        className="absolute inset-1 rounded-full border-2 border-transparent border-t-vortex-400 animate-spin"
        style={{ animationDuration: '0.8s', animationDirection: 'reverse' }}
      />
      <div
        className="absolute inset-2 rounded-full border-2 border-transparent border-t-vortex-300 animate-spin"
        style={{ animationDuration: '0.6s' }}
      />
    </div>
  );
}
