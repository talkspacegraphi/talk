import { useEffect, Suspense, lazy } from 'react';
import { AnimatePresence } from 'framer-motion';
import { useAuthStore } from './stores/authStore';
import { useThemeStore } from './stores/themeStore';
import { useCallStore } from './stores/callStore';
import CustomTitleBar from './components/CustomTitleBar';
import ErrorBoundary from './components/ErrorBoundary';

const AuthPage = lazy(() => import('./pages/AuthPage'));
const ChatPage = lazy(() => import('./pages/ChatPage'));
const CallModal = lazy(() => import('./components/CallModal'));
const GroupCallModal = lazy(() => import('./components/GroupCallModal'));

export default function App() {
  const { token, user, checkAuth, isLoading } = useAuthStore();
  const { appFont } = useThemeStore();
  const { call, groupCall, closeCall, closeGroupCall } = useCallStore();

  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  useEffect(() => {
    document.body.className = `font-${appFont}`;
  }, [appFont]);

  useEffect(() => {
    const update = () => {
      const isElectron = !!(window as any).electronAPI;
      const isMobile = window.innerWidth < 768;
      document.body.style.paddingTop = (isElectron && !isMobile) ? '32px' : '0px';
    };
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
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
    <ErrorBoundary>
      <CustomTitleBar />
      <Suspense
        fallback={
          <div className="h-full flex items-center justify-center bg-surface">
            <VortexLoader />
          </div>
        }
      >
        <AnimatePresence mode="wait">
          {token && user ? (
            <ChatPage key="chat" />
          ) : (
            <AuthPage key="auth" />
          )}
        </AnimatePresence>
      </Suspense>
    </ErrorBoundary>

    {/* CallModals rendered OUTSIDE ErrorBoundary + AnimatePresence for proper z-index */}
    {token && user && (
      <Suspense fallback={null}>
        <CallModal
          key={`call-${call.sessionId}`}
          isOpen={call.isOpen}
          onClose={closeCall}
          targetUser={call.targetUser}
          callType={call.callType}
          incoming={call.incoming}
        />
        <GroupCallModal
          key={`gc-${groupCall.sessionId}`}
          isOpen={groupCall.isOpen}
          onClose={closeGroupCall}
          chatId={groupCall.chatId}
          chatName={groupCall.chatName}
          callType={groupCall.callType}
        />
      </Suspense>
    )}
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
