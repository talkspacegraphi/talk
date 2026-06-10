import { useRef, useEffect, memo, useState } from 'react';
import { createPortal } from 'react-dom';
import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Check,
  CheckCheck,
  Copy,
  Pencil,
  Trash2,
  Reply,
  Pin,
} from 'lucide-react';
import { useChatStore } from '../../stores/chatStore';
import { useAuthStore } from '../../stores/authStore';
import { getSocket } from '../../lib/socket';
import { useLang } from '../../lib/i18n';
import type { Message } from '../../lib/types';

interface MessageContextMenuProps {
  message: Message;
  isMine: boolean;
  isPinned: boolean;
  show: boolean;
  position: { x: number; y: number };
  quotedText: string | null;
  onClose: () => void;
  onReply: () => void;
  onStartSelectionMode?: (id: string) => void;
}

function MessageContextMenu({
  message,
  isMine,
  isPinned,
  show,
  position,
  quotedText,
  onClose,
  onReply,
  onStartSelectionMode,
}: MessageContextMenuProps) {
  const { t } = useLang();
  const { setEditingMessage } = useChatStore();
  const user = useAuthStore(s => s.user);
  const contextMenuRef = useRef<HTMLDivElement>(null);
  const [deleteMenuMode, setDeleteMenuMode] = useState(false);

  useEffect(() => {
    if (!show) return;
    const hideMenu = (e: MouseEvent) => {
      if (contextMenuRef.current?.contains(e.target as Node)) return;
      onClose();
      setDeleteMenuMode(false);
    };
    window.addEventListener('click', hideMenu, true);
    window.addEventListener('contextmenu', hideMenu, true);
    return () => {
      window.removeEventListener('click', hideMenu, true);
      window.removeEventListener('contextmenu', hideMenu, true);
    };
  }, [show, onClose]);

  const handleCopy = () => {
    if (message.content) navigator.clipboard.writeText(message.content);
    onClose();
  };

  const handleEdit = () => {
    setEditingMessage(message);
    onClose();
  };

  const handlePin = () => {
    const socket = getSocket();
    if (socket) {
      if (isPinned) {
        socket.emit('unpin_message', { messageId: message.id, chatId: message.chatId });
      } else {
        socket.emit('pin_message', { messageId: message.id, chatId: message.chatId });
      }
    }
    onClose();
  };

  const handleDeleteForAll = () => {
    const socket = getSocket();
    if (socket) {
      socket.emit('delete_messages', {
        messageIds: [message.id],
        chatId: message.chatId,
        deleteForAll: true,
      });
    }
    onClose();
    setDeleteMenuMode(false);
  };

  const handleDeleteForMe = () => {
    const socket = getSocket();
    if (socket) {
      socket.emit('delete_messages', {
        messageIds: [message.id],
        chatId: message.chatId,
        deleteForAll: false,
      });
    }
    useChatStore.getState().hideMessages([message.id], message.chatId);
    onClose();
    setDeleteMenuMode(false);
  };

  const handleReaction = (emoji: string) => {
    const socket = getSocket();
    if (socket) {
      const existingReaction = message.reactions?.find(
        (r) => r.userId === user?.id && r.emoji === emoji
      );
      if (existingReaction) {
        socket.emit('remove_reaction', { messageId: message.id, chatId: message.chatId, emoji });
      } else {
        socket.emit('add_reaction', { messageId: message.id, chatId: message.chatId, emoji });
      }
    }
    onClose();
  };

  const chatForDelete = useChatStore(s => s.chats.find(c => c.id === message.chatId));
  const otherMemberName = (() => {
    if (!chatForDelete || chatForDelete.type !== 'personal') return '';
    const other = chatForDelete.members.find(m => m.user.id !== user?.id);
    return other?.user.displayName || other?.user.username || '';
  })();

  return createPortal(
    <AnimatePresence>
      {show && (
        <motion.div
          ref={contextMenuRef}
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.9 }}
          className="fixed z-[9999] w-52 rounded-[1.25rem] glass-strong shadow-2xl py-1.5 overflow-hidden border border-white/10"
          style={{ left: position.x, top: position.y }}
          onClick={(e) => e.stopPropagation()}
          onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); }}
        >
          {deleteMenuMode ? (
            <>
              <div className="flex items-center gap-2 px-3 py-2.5 border-b border-border">
                <button onClick={() => setDeleteMenuMode(false)} className="p-1 rounded-lg hover:bg-surface-hover transition-colors text-zinc-400 hover:text-white">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6" /></svg>
                </button>
                <span className="text-sm font-medium text-zinc-300">{t('delete')}</span>
              </div>
              <button onClick={handleDeleteForMe} className="flex items-center gap-3 w-full px-4 py-2.5 text-sm text-zinc-300 hover:bg-surface-hover hover:text-white transition-colors">
                <Trash2 size={16} className="text-zinc-400" />
                {t('deleteForMe')}
              </button>
              <button onClick={handleDeleteForAll} className="flex items-center gap-3 w-full px-4 py-2.5 text-sm text-red-400 hover:bg-red-500/10 hover:text-red-300 transition-colors">
                <Trash2 size={16} />
                {chatForDelete?.type === 'personal' && otherMemberName
                  ? `${t('deleteAlsoFor')} ${otherMemberName}`
                  : t('deleteForAll')}
              </button>
            </>
          ) : (
            <>
              <div className="flex items-center gap-1 px-3 py-2 border-b border-border">
                {['👍', '❤️', '😂', '😮', '😢', '🔥'].map((emoji) => (
                  <button key={emoji} onClick={() => handleReaction(emoji)} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-surface-hover transition-colors text-lg">
                    {emoji}
                  </button>
                ))}
              </div>
              <button onClick={onReply} className="flex items-center gap-3 w-full px-4 py-2.5 text-sm text-zinc-300 hover:bg-surface-hover hover:text-white transition-colors">
                <Reply size={16} />
                {quotedText ? t('replyWithQuote') : t('reply')}
              </button>
              <button onClick={() => { onClose(); onStartSelectionMode?.(message.id); }} className="flex items-center gap-3 w-full px-4 py-2.5 text-sm text-zinc-300 hover:bg-surface-hover hover:text-white transition-colors">
                <CheckCheck size={16} />
                {t('select')}
              </button>
              <button onClick={handlePin} className="flex items-center gap-3 w-full px-4 py-2.5 text-sm text-zinc-300 hover:bg-surface-hover hover:text-white transition-colors">
                <Pin size={16} />
                {isPinned ? t('unpinMessage') : t('pinMessage')}
              </button>
              {message.content && (
                <button onClick={handleCopy} className="flex items-center gap-3 w-full px-4 py-2.5 text-sm text-zinc-300 hover:bg-surface-hover hover:text-white transition-colors">
                  <Copy size={16} />
                  {t('copy')}
                </button>
              )}
              {isMine && message.content && (
                <button onClick={handleEdit} className="flex items-center gap-3 w-full px-4 py-2.5 text-sm text-zinc-300 hover:bg-surface-hover hover:text-white transition-colors">
                  <Pencil size={16} />
                  {t('edit')}
                </button>
              )}
              <div className="border-t border-border my-1" />
              <button onClick={() => setDeleteMenuMode(true)} className="flex items-center gap-3 w-full px-4 py-2.5 text-sm text-red-400 hover:bg-red-500/10 transition-colors">
                <Trash2 size={16} />
                {t('delete')}
              </button>
            </>
          )}
        </motion.div>
      )}
    </AnimatePresence>,
    document.body
  );
}

export default memo(MessageContextMenu);
