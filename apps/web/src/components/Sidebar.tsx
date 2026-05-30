import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Search,
  Plus,
  Menu,
  MessageSquare,
  X,
  User as UserIcon,
  Settings,
  LogOut,
} from 'lucide-react';
import { useAuthStore } from '../stores/authStore';
import { useChatStore } from '../stores/chatStore';
import { useLang } from '../lib/i18n';
import { api } from '../lib/api';
import { getInitials, generateAvatarColor } from '../lib/utils';
import Avatar from './Avatar';
import { StoryGroup } from '../lib/types';
import ChatListItem from './ChatListItem';
import NewChatModal from './NewChatModal';
import UserProfile from './UserProfile';
import SideMenu from './SideMenu';
import StoryViewer, { CreateStoryModal } from './StoryViewer';

const API_URL = import.meta.env.VITE_API_URL || '';

export default function Sidebar() {
  const { user, logout } = useAuthStore();
  const { chats, activeChat, searchQuery, setSearchQuery, clearStore } = useChatStore();
  const { t } = useLang();
  const [showNewChat, setShowNewChat] = useState(false);
  const [showProfile, setShowProfile] = useState(false);
  const [showSideMenu, setShowSideMenu] = useState(false);
  const [storyGroups, setStoryGroups] = useState<StoryGroup[]>([]);
  const [storyViewerIndex, setStoryViewerIndex] = useState<number | null>(null);
  const [showCreateStory, setShowCreateStory] = useState(false);
  const [activeSection, setActiveSection] = useState<'chats' | 'profile' | 'settings'>('chats');

  const loadStories = () => {
    api.getStories().then(setStoryGroups).catch(console.error);
  };

  useEffect(() => {
    loadStories();
    const interval = setInterval(loadStories, 30000); // refresh every 30s
    return () => clearInterval(interval);
  }, []);

  const filteredChats = chats.filter((chat) => {
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
    // Favorites chat always on top
    if (a.type === 'favorites') return -1;
    if (b.type === 'favorites') return 1;
    return 0;
  });

  const handleLogout = () => {
    clearStore();
    logout();
  };

  const isMobile = typeof window !== 'undefined' && window.innerWidth < 768;

  return (
    <>
      <motion.div
        initial={false}
        animate={isMobile ? { x: activeChat ? '-100%' : '0%', opacity: activeChat ? 0 : 1 } : { x: '0%', opacity: 1 }}
        transition={{ type: 'spring', stiffness: 400, damping: 35, mass: 0.8 }}
        className={`w-full md:w-[400px] h-full bg-surface-secondary rounded-none md:rounded-3xl overflow-hidden border-0 md:border md:border-border/50 md:shadow-2xl ${isMobile ? 'absolute inset-0' : 'relative'} z-20 flex`}
      >
        {/* Боковая панель с кнопками */}
        <div className="hidden md:flex w-[72px] flex-shrink-0 bg-surface-secondary flex-col py-4 relative items-center justify-center">
          <div className="absolute right-0 top-0 bottom-0 w-px bg-gradient-to-b from-transparent via-zinc-700/50 to-transparent"></div>
          <div className="flex flex-col items-center gap-2">
            <button
              onClick={() => setShowProfile(true)}
              className="flex flex-col items-center gap-1 p-2 rounded-xl hover:bg-surface-hover transition-colors text-zinc-400 hover:text-white w-full"
            >
              <UserIcon size={20} />
              <span className="text-[10px]">Профиль</span>
            </button>
            <button
              onClick={() => setShowSideMenu(true)}
              className="flex flex-col items-center gap-1 p-2 rounded-xl hover:bg-surface-hover transition-colors text-zinc-400 hover:text-white w-full"
            >
              <Settings size={20} />
              <span className="text-[10px]">{t('settings')}</span>
            </button>
            <button
              onClick={handleLogout}
              className="flex flex-col items-center gap-1 p-2 rounded-xl hover:bg-red-500/20 transition-colors text-red-400 hover:text-red-300 w-full"
            >
              <LogOut size={20} />
              <span className="text-[10px]">Выйти</span>
            </button>
          </div>
        </div>

        {/* Основной контент */}
        <div className="flex-1 flex flex-col overflow-hidden">
        {/* Шапка */}
        <div className="h-[64px] md:h-[76px] px-4 flex items-center gap-3 border-b border-border/40 bg-surface-secondary flex-shrink-0">
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <img src="/logo.png" alt="Vortex" className="w-8 h-8 rounded-lg object-cover" />
            <h1 className="text-lg font-bold gradient-text truncate">Talk</h1>
          </div>
          <button
            onClick={() => setShowNewChat(true)}
            className="p-2 rounded-lg hover:bg-surface-hover transition-colors text-zinc-400 hover:text-white"
            title={t('newChat')}
          >
            <Plus size={20} />
          </button>
        </div>

        {/* Поиск */}
        <div className="p-4 bg-surface-secondary/50">
          <div className="relative group">
            <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-500 group-focus-within:text-accent transition-colors" />
            <input
              type="text"
              placeholder={t('searchChats')}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-11 pr-10 py-3 rounded-2xl bg-surface-tertiary/80 text-[15px] font-medium text-white placeholder-zinc-500 border border-border/30 hover:border-border/60 focus:border-accent transition-all outline-none shadow-inner"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 p-1 rounded-full bg-surface-hover text-zinc-400 hover:text-white transition-colors"
              >
                <X size={14} />
              </button>
            )}
          </div>
        </div>

        {/* Story circles */}
        {(storyGroups.length > 0 || true) && (
          <div className="flex items-center gap-3 px-4 py-2 overflow-x-auto scrollbar-hide border-b border-border/20 flex-shrink-0">
            {/* Add story circle */}
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

        {/* Список чатов */}
        <div className="flex-1 overflow-y-auto pb-20 md:pb-0">{/* pb-20 для отступа под нижнюю навигацию */}
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

        {/* Мобильная панель с кнопками внизу */}
        <div className="md:hidden fixed bottom-0 left-0 right-0 z-30" style={{ paddingBottom: 'max(env(safe-area-inset-bottom), 0.5rem)' }}>
          {/* Контейнер с кнопками */}
          <div className="mx-3 mb-2 bg-surface-secondary/95 backdrop-blur-xl rounded-[1.5rem] border border-border/50 shadow-2xl p-1.5">
            <div className="flex items-center justify-around gap-1.5">
              <button
                onClick={() => { setActiveSection('chats'); }}
                className={`flex-1 flex flex-col items-center gap-1 py-2 rounded-xl transition-all duration-200 ease-out ${
                  activeSection === 'chats'
                    ? 'bg-vortex-500/20 text-vortex-400 shadow-lg shadow-vortex-500/20'
                    : 'text-zinc-400 hover:bg-white/5 hover:text-white active:scale-95'
                }`}
              >
                <div className="w-10 h-10 rounded-full bg-white/5 flex items-center justify-center transition-all duration-200">
                  <MessageSquare size={20} strokeWidth={2.5} />
                </div>
                <span className="text-[9px] font-medium">Чаты</span>
              </button>
              <button
                onClick={() => { setActiveSection('settings'); setShowSideMenu(true); }}
                className={`flex-1 flex flex-col items-center gap-1 py-2 rounded-xl transition-all duration-200 ease-out ${
                  activeSection === 'settings'
                    ? 'bg-vortex-500/20 text-vortex-400 shadow-lg shadow-vortex-500/20'
                    : 'text-zinc-400 hover:bg-white/5 hover:text-white active:scale-95'
                }`}
              >
                <div className="w-10 h-10 rounded-full bg-white/5 flex items-center justify-center transition-all duration-200">
                  <Settings size={20} strokeWidth={2.5} />
                </div>
                <span className="text-[9px] font-medium">Настройки</span>
              </button>
              <button
                onClick={() => { setActiveSection('profile'); setShowProfile(true); }}
                className={`flex-1 flex flex-col items-center gap-1 py-2 rounded-xl transition-all duration-200 ease-out ${
                  activeSection === 'profile'
                    ? 'bg-vortex-500/20 text-vortex-400 shadow-lg shadow-vortex-500/20'
                    : 'text-zinc-400 hover:bg-white/5 hover:text-white active:scale-95'
                }`}
              >
                <div className="relative transition-all duration-200">
                  {user?.avatar ? (
                    <img src={user.avatar} alt="" className="w-10 h-10 rounded-full object-cover ring-2 ring-white/10 transition-all duration-200" />
                  ) : (
                    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-vortex-500 to-purple-600 flex items-center justify-center text-white font-bold text-xs ring-2 ring-white/10 transition-all duration-200">
                      {(user?.displayName || user?.username || '??').split(' ').map((w: string) => w[0]).join('').slice(0, 2).toUpperCase()}
                    </div>
                  )}
                </div>
                <span className="text-[9px] font-medium">Профиль</span>
              </button>
            </div>
          </div>
        </div>
        </div>
      </motion.div>

      {/* Модалки */}
      <AnimatePresence>
        {showNewChat && <NewChatModal onClose={() => setShowNewChat(false)} />}
      </AnimatePresence>
      <AnimatePresence>
        {showProfile && <UserProfile userId={user!.id} onClose={() => { setShowProfile(false); setActiveSection('chats'); }} isSelf />}
      </AnimatePresence>
      <SideMenu
        isOpen={showSideMenu}
        onClose={() => { setShowSideMenu(false); setActiveSection('chats'); }}
      />
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
    </>
  );
}
