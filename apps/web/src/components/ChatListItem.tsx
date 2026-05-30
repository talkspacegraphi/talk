import { useState, useRef, useEffect, memo, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { motion } from 'framer-motion';
import { formatDistanceToNow } from 'date-fns';
import { ru, enUS } from 'date-fns/locale';
import { Check, CheckCheck, Image, FileText, Mic, Video, Pin, Trash2, Bookmark } from 'lucide-react';
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

function ChatListItem({ chat, isActive }: ChatListItemProps) {
  const { user } = useAuthStore();
  const { setActiveChat, loadMessages, typingUsers, drafts, loadChats } = useChatStore();
  const { t, lang } = useLang();

  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number } | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const ctxRef = useRef<HTMLDivElement>(null);

  const myMember = useMemo(() => chat.members.find((m) => m.user.id === user?.id), [chat.members, user?.id]);
  const isPinned = myMember?.isPinned ?? false;
  const draft = drafts[chat.id] || '';
  const otherMember = useMemo(() => chat.members.find((m) => m.user.id !== user?.id), [chat.members, user?.id]);
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

  const typingInChat = useMemo(() =>
    typingUsers.filter((t) => t.chatId === chat.id && t.userId !== user?.id), [typingUsers, chat.id, user?.id]);
  const isTyping = typingInChat.length > 0;

  const lastMessage = chat.messages?.[0];
  const lastMessageText = lastMessage
    ? lastMessage.isDeleted
      ? t('messageDeleted')
      : lastMessage.type === 'voice'
        ? t('voice')
        : lastMessage.type === 'file' || lastMessage.type === 'image' || lastMessage.type === 'video'
          ? lastMessage.media?.[0]?.type === 'image'
            ? t('photo')
            : lastMessage.media?.[0]?.type === 'video'
              ? t('video')
              : t('file')
          : lastMessage.content || ''
    : '';

  const previewText = useMemo(() => stripMarkdown(lastMessageText), [lastMessageText]);
  const isMine = lastMessage?.senderId === user?.id;
  const isRead = lastMessage?.readBy?.some((r) => r.userId !== user?.id);
  const timeStr = lastMessage
    ? formatDistanceToNow(new Date(lastMessage.createdAt), { addSuffix: false, locale: lang === 'ru' ? ru : enUS })
    : '';

  const handleClick = () => {
    setActiveChat(chat.id);
    loadMessages(chat.id);
  };

  const handleContextMenu = (e: React.MouseEvent) => {
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
  };

  useEffect(() => {
    if (!ctxMenu) return;
    const close = (e: MouseEvent) => {
      if (ctxRef.current && !ctxRef.current.contains(e.target as Node)) setCtxMenu(null);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [ctxMenu]);

  const handlePin = async () => {
    setCtxMenu(null);
    try {
      await api.togglePinChat(chat.id);
      loadChats();
    } catch (e) { console.error(e); }
  };

  const handleDelete = async () => {
    setCtxMenu(null);
    setShowDeleteConfirm(true);
  };

  const confirmDelete = async () => {
    setShowDeleteConfirm(false);
    try {
      await api.deleteChat(chat.id);
      useChatStore.getState().removeChat(chat.id);
    } catch (e) { console.error(e); }
  };

  const initials = chatName
    .split(' ')
    .map((w: string) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  return (
    <>
      <div className="relative">
        <motion.button
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -20 }}
          transition={{ duration: 0.15, ease: 'easeOut' }}
          whileTap={{ scale: 0.98 }}
          onClick={handleClick}
          onContextMenu={handleContextMenu}
          className={`w-full flex items-center gap-3 px-3 py-3 transition-all duration-150 text-left ${
            isActive ? 'bg-accent/15 border-r-2 border-accent' : 'hover:bg-surface-hover active:bg-surface-hover/80'
          }`}
        >
        {/* Аватар */}
        <div className="relative flex-shrink-0">
          {isFavorites ? (
            <div className="w-12 h-12 rounded-full bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center shadow-lg">
              <Bookmark size={22} className="text-white" />
            </div>
          ) : (
            <Avatar src={chatAvatar} name={chatName} size="lg" online={isOnline ? true : undefined} />
          )}
        </div>

        {/* Инфо */}
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
                {isTyping ? t('typing') : draft ? <><span className="font-medium">{t('draft')} </span>{stripMarkdown(draft)}</> : previewText}
              </p>
            </div>
            {chat.unreadCount > 0 && !isActive && (
              <span className="ml-2 flex-shrink-0 min-w-[20px] h-5 px-1.5 rounded-full bg-accent flex items-center justify-center text-[11px] text-white font-medium">
                {chat.unreadCount}
              </span>
            )}
          </div>
        </div>
        </motion.button>
      </div>

      {/* Context Menu — portal to body to avoid clipping */}
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
