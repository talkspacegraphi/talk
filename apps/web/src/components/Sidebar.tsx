import { useState, useEffect, useMemo, lazy, Suspense } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Search,
  Plus,
  MessageSquare,
  X,
  Settings,
} from 'lucide-react';
import { useAuthStore } from '../stores/authStore';
import { useChatStore } from '../stores/chatStore';
import { useLang } from '../lib/i18n';
import { api } from '../lib/api';
import Avatar from './Avatar';
import SettingsPanel from './SettingsPanel';
import { StoryGroup } from '../lib/types';
import ChatListItem from './ChatListItem';

const NewChatModal = lazy(() => import('./NewChatModal'));
const StoryViewer = lazy(() => import('./StoryViewer'));
const CreateStoryModal = lazy(() => import('./StoryViewer').then(m => ({ default: m.CreateStoryModal })));

const API_URL = import.meta.env.VITE_API_URL || '';

export default function Sidebar() {
  const { user } = useAuthStore();
  const chats = useChatStore(s => s.chats);
  const activeChat = useChatStore(s => s.activeChat);
  const searchQuery = useChatStore(s => s.searchQuery);
  const setSearchQuery = useChatStore(s => s.setSearchQuery);
  const { t } = useLang();
  const [showNewChat, setShowNewChat] = useState(false);
  const [storyGroups, setStoryGroups] = useState<StoryGroup[]>([]);
  const [storyViewerIndex, setStoryViewerIndex] = useState<number | null>(null);
  const [showCreateStory, setShowCreateStory] = useState(false);
  const [activeTab, setActiveTab] = useState<'chats' | 'settings'>('chats');

  const loadStories = () => {
    api.getStories().then(setStoryGroups).catch(console.error);
  };

  useEffect(() => {
    loadStories();
    const interval = setInterval(loadStories, 30000);
    return () => clearInterval(interval);
  }, []);

  const filteredChats = useMemo(() => chats.filter((chat) => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    if (chat.name?.toLowerCase().includes(q)) return true;
    return chat.members.some(
      (m) =>
        m.user.id !== user?.id &&
        (m.user.username.toLowerCase().includes(q) ||
          m.user.displayName.toLowerCase().includes(q))
    );
  }).sort((a, b) => {
    if (a.type === 'favorites') return -1;
    if (b.type === 'favorites') return 1;
    return 0;
  }), [chats, searchQuery, user?.id]);

  const [isMobile, setIsMobile] = useState(() => typeof window !== 'undefined' && window.innerWidth < 768);

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  return (
    <>
      <motion.div
        initial={false}
        animate={isMobile ? { x: activeChat ? '-100%' : '0%', opacity: activeChat ? 0 : 1 } : { x: '0%', opacity: 1 }}
        transition={{ type: 'tween', duration: 0.15, ease: [0.25, 1, 0.5, 1] }}
        style={{ willChange: 'transform, opacity' }}
        className={`w-full md:w-[400px] h-full bg-surface-secondary rounded-none md:rounded-3xl overflow-hidden border-0 md:border md:border-border/50 md:shadow-2xl ${isMobile ? 'absolute inset-0' : 'relative'} z-20 flex`}
      >
        {/* Desktop: thin nav strip */}
        <div className="hidden md:flex w-[56px] flex-shrink-0 bg-surface-secondary flex-col py-3 items-center gap-2 relative">
          <div className="absolute right-0 top-0 bottom-0 w-px bg-gradient-to-b from-transparent via-zinc-700/50 to-transparent" />
          
          {/* User avatar as nav indicator */}
          <button
            onClick={() => setActiveTab(activeTab === 'chats' ? 'settings' : 'chats')}
            className="w-10 h-10 rounded-xl overflow-hidden flex items-center justify-center hover:bg-surface-hover transition-colors"
            title="Настройки"
          >
            {user?.avatar ? (
              <img src={user.avatar} alt="" className={`w-8 h-8 rounded-lg object-cover ring-2 transition-all ${activeTab === 'settings' ? 'ring-vortex-500' : 'ring-transparent'}`} />
            ) : (
              <div className={`w-8 h-8 rounded-lg bg-gradient-to-br from-vortex-500 to-purple-600 flex items-center justify-center text-white text-[10px] font-bold ring-2 transition-all ${activeTab === 'settings' ? 'ring-vortex-500' : 'ring-transparent'}`}>
                {(user?.displayName || user?.username || '??').split(' ').map((w: string) => w[0]).join('').slice(0, 2).toUpperCase()}
              </div>
            )}
          </button>

          {/* Chats tab indicator */}
          <button
            onClick={() => setActiveTab('chats')}
            className={`w-10 h-10 rounded-xl flex items-center justify-center transition-colors ${
              activeTab === 'chats' ? 'bg-vortex-500/15 text-vortex-400' : 'text-zinc-500 hover:bg-surface-hover hover:text-zinc-300'
            }`}
            title="Чаты"
          >
            <MessageSquare size={20} />
          </button>

          {/* Settings tab indicator */}
          <button
            onClick={() => setActiveTab('settings')}
            className={`w-10 h-10 rounded-xl flex items-center justify-center transition-colors ${
              activeTab === 'settings' ? 'bg-vortex-500/15 text-vortex-400' : 'text-zinc-500 hover:bg-surface-hover hover:text-zinc-300'
            }`}
            title={String(t('settings'))}
          >
            <Settings size={20} />
          </button>
        </div>

        {/* Main content area */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {activeTab === 'settings' ? (
            <SettingsPanel />
          ) : (
            <>
              {/* Header */}
              <div className="h-[64px] md:h-[76px] px-4 flex items-center gap-3 border-b border-border/40 bg-surface-secondary flex-shrink-0">
                <div className="flex items-center gap-2 flex-1 min-w-0">
                  <img src="/logo.png" alt="Vortex" className="w-8 h-8 rounded-lg object-cover" />
                  <h1 className="text-lg font-bold gradient-text truncate">Talk</h1>
                </div>
                <button
                  onClick={() => setShowNewChat(true)}
                  className="p-2 rounded-lg hover:bg-surface-hover transition-colors text-zinc-400 hover:text-white"
                  title={t('newChat')}
                  aria-label={String(t('newChat'))}
                >
                  <Plus size={20} />
                </button>
              </div>

              {/* Search */}
              <div className="px-3 py-2">
                <div className="relative">
                  <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
                  <input
                    type="search"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder={t('searchChats')}
                    aria-label={t('searchChats')}
                    className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-surface-tertiary text-sm text-white placeholder-zinc-500 border border-transparent focus:border-accent/50 focus:ring-1 focus:ring-accent/25 transition-all outline-none"
                  />
                  {searchQuery && (
                    <button
                      onClick={() => setSearchQuery('')}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300 transition-colors"
                      aria-label={'Очистить поиск'}
                    >
                      <X size={14} />
                    </button>
                  )}
                </div>
              </div>

              {/* Story circles */}
              {(storyGroups.length > 0 || true) && (
                <div className="flex items-center gap-3 px-4 py-2 overflow-x-auto scrollbar-hide border-b border-border/20 flex-shrink-0">
                  <button
                    onClick={() => setShowCreateStory(true)}
                    className="flex flex-col items-center gap-1 flex-shrink-0 group"
                  >
                    <div className="w-14 h-14 rounded-full border-2 border-dashed border-zinc-600 flex items-center justify-center group-hover:border-vortex-400 transition-colors">
                      <Plus size={20} className="text-zinc-400 group-hover:text-vortex-400 transition-colors" />
                    </div>
                    <span className="text-[10px] text-zinc-500 truncate w-14 text-center">{t('newStory')}</span>
                  </button>

                  {storyGroups.map((group, idx) => {
                    const avatarUrl = group.user.avatar ? `${API_URL}${group.user.avatar}` : null;
                    const isMine = group.user.id === user?.id;
                    return (
                      <button
                        key={group.user.id}
                        onClick={() => setStoryViewerIndex(idx)}
                        className="flex flex-col items-center gap-1 flex-shrink-0 group"
                      >
                        <div className={`w-14 h-14 rounded-full p-[2.5px] transition-transform group-hover:scale-105 ${
                          group.hasUnviewed
                            ? 'bg-gradient-to-tr from-vortex-400 via-purple-500 to-pink-500 shadow-lg shadow-vortex-500/25'
                            : isMine
                              ? 'bg-gradient-to-tr from-zinc-500 to-zinc-600'
                              : 'bg-zinc-700'
                        }`}>
                          <div className="w-full h-full rounded-full overflow-hidden border-[2.5px] border-surface-secondary">
                            <Avatar
                              src={avatarUrl}
                              name={group.user.displayName || group.user.username}
                              size="lg"
                              className="w-full h-full"
                            />
                          </div>
                        </div>
                        <span className="text-[10px] text-zinc-400 truncate w-14 text-center">
                          {isMine ? t('myStory') : (group.user.displayName || group.user.username).split(' ')[0]}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}

              {/* Chat list */}
              <div
                className="flex-1 overflow-y-auto pb-20 md:pb-0"
                style={{ contain: 'layout style paint', willChange: 'scroll-position' }}
              >
                {filteredChats.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-full text-zinc-500 gap-3 px-6">
                    <MessageSquare size={40} className="opacity-30" />
                    <p className="text-sm text-center">
                      {searchQuery ? t('nothingFound') : t('noChats')}
                    </p>
                  </div>
                ) : (
                  filteredChats.map((chat) => (
                    <ChatListItem key={chat.id} chat={chat} isActive={chat.id === activeChat} />
                  ))
                )}
              </div>
            </>
          )}
        </div>

        {/* Mobile bottom nav */}
        <nav className="md:hidden fixed bottom-0 left-0 right-0 z-30 flex justify-center pointer-events-none" style={{ paddingBottom: 'env(safe-area-inset-bottom)' }} aria-label="Основная навигация">
          <div className="pointer-events-auto mx-3 mb-2.5 bg-surface-secondary/95 backdrop-blur-xl rounded-full border border-border/50 shadow-2xl shadow-black/40 px-5 py-2.5 flex items-center justify-around gap-1">
            <button
              role="tab"
              aria-selected={activeTab === 'chats'}
              onClick={() => { setActiveTab('chats'); }}
              className={`flex flex-col items-center gap-1 px-3 py-1 rounded-full transition-all duration-200 ${
                activeTab === 'chats'
                  ? 'text-vortex-400'
                  : 'text-zinc-400 active:text-zinc-200'
              }`}
            >
              <svg width="24" height="24" viewBox="0 0 24 24" fill={activeTab === 'chats' ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
              </svg>
              <span className={`text-[10px] leading-none ${activeTab === 'chats' ? 'font-bold' : 'font-semibold'}`}>Чаты</span>
            </button>
            <button
              onClick={() => { setActiveTab('settings'); }}
              className={`flex flex-col items-center gap-1 px-3 py-1 rounded-full transition-all duration-200 ${
                activeTab === 'settings'
                  ? 'text-vortex-400'
                  : 'text-zinc-400 active:text-zinc-200'
              }`}
            >
              {user?.avatar ? (
                <img src={user.avatar} alt="" className={`w-6 h-6 rounded-full object-cover ring-2 transition-all ${activeTab === 'settings' ? 'ring-vortex-500' : 'ring-transparent'}`} />
              ) : (
                <div className={`w-6 h-6 rounded-full bg-gradient-to-br from-vortex-500 to-purple-600 flex items-center justify-center text-white text-[8px] font-bold ring-2 transition-all ${activeTab === 'settings' ? 'ring-vortex-500' : 'ring-transparent'}`}>
                  {(user?.displayName || user?.username || '??').split(' ').map((w: string) => w[0]).join('').slice(0, 2).toUpperCase()}
                </div>
              )}
              <span className={`text-[10px] leading-none ${activeTab === 'settings' ? 'font-bold' : 'font-semibold'}`}>Профиль</span>
            </button>
          </div>
        </nav>
      </motion.div>

      {/* Modals */}
      <Suspense fallback={null}>
        <AnimatePresence>
          {showNewChat && <NewChatModal onClose={() => setShowNewChat(false)} />}
        </AnimatePresence>
        <AnimatePresence>
          {storyViewerIndex !== null && storyGroups.length > 0 && (
            <StoryViewer
              stories={storyGroups}
              initialUserIndex={storyViewerIndex}
              onClose={() => { setStoryViewerIndex(null); loadStories(); }}
              onRefresh={loadStories}
            />
          )}
        </AnimatePresence>
        <AnimatePresence>
          {showCreateStory && (
            <CreateStoryModal
              onClose={() => setShowCreateStory(false)}
              onCreated={loadStories}
            />
          )}
        </AnimatePresence>
      </Suspense>
    </>
  );
}
