import { useState, useRef, useEffect, memo, useMemo, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { motion } from 'framer-motion';
import { formatDistanceToNowStrict } from 'date-fns';
import { ru, enUS } from 'date-fns/locale';
import { Check, CheckCheck, Pin, Trash2, Bookmark, Music } from 'lucide-react';
import { useAuthStore } from '../stores/authStore';
import { useChatStore } from '../stores/chatStore';
import { useLang } from '../lib/i18n';
import { stripMarkdown } from '../lib/utils';
import { api } from '../lib/api';
import ConfirmModal from './ConfirmModal';
import Avatar from './Avatar';
import type { Chat } from '../lib/types';

interface ChatListItemProps {
  chat: Chat;
  isActive: boolean;
}

// Preload cache — prevent duplicate fetches
const preloadedChats = new Set<string>();

function ChatListItem({ chat, isActive }: ChatListItemProps) {
  const userId = useAuthStore(s => s.user?.id);
  const setActiveChat = useChatStore(s => s.setActiveChat);
  const loadMessages = useChatStore(s => s.loadMessages);
  const loadChats = useChatStore(s => s.loadChats);
  // Подписка только на нужный draft — иначе чат-лист ререндерится при печати в ЛЮБОМ чате
  const draft = useChatStore(s => s.drafts[chat.id] || '');
  const { t, lang } = useLang();

  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number } | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const ctxRef = useRef<HTMLDivElement>(null);

  const myMember = useMemo(() => chat.members.find((m) => m.user.id === userId), [chat.members, userId]);
  const isPinned = myMember?.isPinned ?? false;
  const otherMember = useMemo(() => chat.members.find((m) => m.user.id !== userId), [chat.members, userId]);
  const isFavorites = chat.type === 'favorites';
  const chatName = isFavorites
    ? t('favorites')
    : chat.type === 'personal'
      ? otherMember?.user.displayName || otherMember?.user.username || t('chat')
      : chat.name || t('group');
  const chatAvatar = isFavorites
    ? null
    : chat.type === 'personal'
      ? otherMember?.user.avatar
      : chat.avatar;
  const isOnline = chat.type === 'personal' && otherMember?.user.isOnline;

  // Используем ref + подписку через типизированный селектор, чтобы не ререндерить ВСЕ чаты
  // при печати у одного пользователя. Селектор возвращает только факт «печатает ли кто-то у нас».
  const isTyping = useChatStore(s =>
    s.typingUsers.some(u => u.chatId === chat.id && u.userId !== userId)
  );

  const lastMessage = chat.messages?.[0];
  const lastMessageText = useMemo(() => {
    if (!lastMessage) return '';
    if (lastMessage.isDeleted) return t('messageDeleted');
    if (lastMessage.type === 'voice') return t('voice');
    if (lastMessage.type === 'audio') return lastMessage.media?.[0]?.filename || t('audio');
    if (lastMessage.type === 'file' || lastMessage.type === 'image' || lastMessage.type === 'video') {
      const mt = lastMessage.media?.[0]?.type;
      if (mt === 'image') return t('photo');
      if (mt === 'video') return t('video');
      return t('file');
    }
    return lastMessage.content || '';
  }, [lastMessage, t]);

  const previewText = useMemo(() => stripMarkdown(lastMessageText), [lastMessageText]);
  const isMine = lastMessage?.senderId === userId;
  const isRead = lastMessage?.readBy?.some((r) => r.userId !== userId);
  const isAudioMessage = lastMessage?.type === 'audio';

  // Мемоизируем тайм — formatDistanceToNow не дёшев из-за локали
  const timeStr = useMemo(() => {
    if (!lastMessage) return '';
    return formatDistanceToNowStrict(new Date(lastMessage.createdAt), {
      addSuffix: false,
      locale: lang === 'ru' ? ru : enUS,
    });
  }, [lastMessage?.createdAt, lang]);

  const handleClick = useCallback(() => {
    setActiveChat(chat.id);
    loadMessages(chat.id);
  }, [chat.id, setActiveChat, loadMessages]);

  // Preload messages on hover for instant switching (desktop only)
  const handleMouseEnter = useCallback(() => {
    if (typeof window !== 'undefined' && window.innerWidth < 768) return;
    if (preloadedChats.has(chat.id)) return;
    const state = useChatStore.getState();
    if (state.messages[chat.id]?.length > 0) return;
    preloadedChats.add(chat.id);
    api.getMessages(chat.id, undefined, 30).then((fetched) => {
      const hasMore = fetched.length >= 30;
      useChatStore.setState((s) => {
        const existing = s.messages[chat.id] || [];
        const fetchedIds = new Set(fetched.map(m => m.id));
        const socketOnly = existing.filter(m => !fetchedIds.has(m.id));
        const merged = [...fetched, ...socketOnly].sort(
          (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
        );
        return {
          messages: { ...s.messages, [chat.id]: merged },
          hasMore: { ...s.hasMore, [chat.id]: hasMore },
        };
      });
    }).catch(() => {});
  }, [chat.id]);

  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const menuWidth = 200;
    const menuHeight = 120;
    let x = e.clientX;
    let y = e.clientY;
    if (x + menuWidth > window.innerWidth) x = window.innerWidth - menuWidth - 8;
    if (y + menuHeight > window.innerHeight) y = window.innerHeight - menuHeight - 8;
    if (x < 8) x = 8;
    if (y < 8) y = 8;
    setCtxMenu({ x, y });
  }, []);

  useEffect(() => {
    if (!ctxMenu) return;
    const close = (e: MouseEvent) => {
      if (ctxRef.current && !ctxRef.current.contains(e.target as Node)) setCtxMenu(null);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [ctxMenu]);

  const handlePin = useCallback(async () => {
    setCtxMenu(null);
    try {
      await api.togglePinChat(chat.id);
      loadChats();
    } catch (e) { console.error(e); }
  }, [chat.id, loadChats]);

  const handleDelete = useCallback(() => {
    setCtxMenu(null);
    setShowDeleteConfirm(true);
  }, []);

  const confirmDelete = useCallback(async () => {
    setShowDeleteConfirm(false);
    try {
      await api.deleteChat(chat.id);
      useChatStore.getState().removeChat(chat.id);
    } catch (e) { console.error(e); }
  }, [chat.id]);

  return (
    <>
      <div
        className="relative"
        style={{ contain: 'layout style paint' }}
      >
        <button
          onClick={handleClick}
          onMouseEnter={handleMouseEnter}
          onContextMenu={handleContextMenu}
          className={`chat-list-item w-full flex items-center gap-3 px-3 py-3 text-left ${
            isActive ? 'bg-accent/15 border-r-2 border-accent' : 'hover:bg-surface-hover'
          }`}
        >
          <div className="relative flex-shrink-0">
            {isFavorites ? (
              <div className="w-12 h-12 rounded-full bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center shadow-lg">
                <Bookmark size={22} className="text-white" />
              </div>
            ) : (
              <Avatar src={chatAvatar} name={chatName} size="lg" online={isOnline ? true : undefined} />
            )}
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5 min-w-0">
                {isPinned && <Pin size={12} className="text-vortex-400 flex-shrink-0 rotate-45" />}
                <span className="text-sm font-medium text-white truncate">{chatName}</span>
              </div>
              {timeStr && <span className="text-xs text-zinc-500 flex-shrink-0 ml-2">{timeStr}</span>}
            </div>
            <div className="flex items-center justify-between mt-0.5">
              <div className="flex items-center gap-1 min-w-0 flex-1">
                {isMine && lastMessage && !lastMessage.isDeleted && (
                  <span className="flex-shrink-0">
                    {isRead ? (
                      <CheckCheck size={14} className="text-vortex-400" />
                    ) : (
                      <Check size={14} className="text-zinc-500" />
                    )}
                  </span>
                )}
                <p className={`text-xs truncate ${isTyping ? 'text-vortex-400 font-medium' : draft ? 'text-red-400' : 'text-zinc-400'}`}>
                  {isTyping ? t('typing') : draft ? <><span className="font-medium">{t('draft')} </span>{stripMarkdown(draft)}</> : (
                    <>
                      {isAudioMessage && (
                        <Music size={12} className={`inline-block mr-1 flex-shrink-0 -mt-0.5 ${isMine ? 'text-white/50' : 'text-vortex-400'}`} />
                      )}
                      {previewText}
                    </>
                  )}
                </p>
              </div>
              {chat.unreadCount > 0 && !isActive && (
                <span className="ml-2 flex-shrink-0 min-w-[20px] h-5 px-1.5 rounded-full bg-accent flex items-center justify-center text-[11px] text-white font-medium">
                  {chat.unreadCount}
                </span>
              )}
            </div>
          </div>
        </button>
      </div>

      {ctxMenu && typeof document !== 'undefined' && createPortal(
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.95 }}
          transition={{ duration: 0.1 }}
          ref={ctxRef}
          className="fixed z-[9999] min-w-[180px] py-1 rounded-xl bg-surface-secondary border border-border shadow-xl"
          style={{ top: ctxMenu.y, left: ctxMenu.x }}
        >
          <button
            onClick={handlePin}
            className="flex items-center gap-3 w-full px-4 py-2.5 text-sm text-zinc-300 hover:bg-surface-hover hover:text-white transition-colors"
          >
            <Pin size={16} className={isPinned ? 'rotate-45' : ''} />
            {isPinned ? t('unpinChat') : t('pinChat')}
          </button>
          <div className="border-t border-border my-1" />
          <button
            onClick={handleDelete}
            className="flex items-center gap-3 w-full px-4 py-2.5 text-sm text-red-400 hover:bg-red-500/10 transition-colors"
          >
            <Trash2 size={16} />
            {t('deleteChat')}
          </button>
        </motion.div>,
        document.body
      )}

      <ConfirmModal
        open={showDeleteConfirm}
        message={t('deleteChatConfirm')}
        onConfirm={confirmDelete}
        onCancel={() => setShowDeleteConfirm(false)}
      />
    </>
  );
}

export default memo(ChatListItem);
