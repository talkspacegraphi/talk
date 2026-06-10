import { useState, useEffect, useLayoutEffect, useRef, useCallback, useMemo, memo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useVirtualizer } from '@tanstack/react-virtual';
import {
  Phone,
  Video,
  MoreVertical,
  Search,
  X,
  ArrowDown,
  ArrowLeft,
  Trash2,
  UserPlus,
  Bell,
  BellOff,
  Settings,
  Eraser,
  Pin,
  Forward,
  Reply,
  Bookmark,
  Ban,
  Check,
  Image,
} from 'lucide-react';
import { useChatStore } from '../stores/chatStore';
import { useAuthStore } from '../stores/authStore';
import { api } from '../lib/api';
import { getSocket } from '../lib/socket';
import { isChatMuted, toggleMuteChat } from '../lib/sounds';
import { useLang } from '../lib/i18n';
import { formatLastSeen } from '../lib/utils';
import type { UserBasic, Message } from '../lib/types';
import MessageBubble from './MessageBubble';
import MessageInput from './MessageInput';
import TypingIndicator from './TypingIndicator';

import Tooltip from './Tooltip';
import GroupSettings from './GroupSettings';
import ForwardModal from './ForwardModal';
import ConfirmModal from './ConfirmModal';
import Avatar from './Avatar';
import { useThemeStore } from '../stores/themeStore';

export default function ChatView({ onStartCall, onStartGroupCall, profileUserId, onOpenProfile }: { onStartCall?: (targetUser: UserBasic, type: 'voice' | 'video') => void; onStartGroupCall?: (chatId: string, chatName: string, type: 'voice' | 'video') => void; profileUserId?: string | null; onOpenProfile?: (userId: string) => void }) {
  const { user } = useAuthStore();
  const { t, lang } = useLang();
  const { chatTheme, setChatBackground, getChatBackground } = useThemeStore();
  const {
    activeChat,
    chats,
    messages,
    typingUsers,
    pinnedMessages,
    isLoadingMessages,
    isLoadingMore,
    hasMore,
    setActiveChat,
    setReplyTo,
    loadMoreMessages,
    saveScrollPosition,
    scrollPositions,
  } = useChatStore();

  const [showTopMenu, setShowTopMenu] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const [searchText, setSearchText] = useState('');
  const [searchResults, setSearchResults] = useState<Message[]>([]);
  const [showGroupSettings, setShowGroupSettings] = useState(false);
  const [showScrollDown, setShowScrollDown] = useState(false);
  const [muted, setMuted] = useState(false);

  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedMessages, setSelectedMessages] = useState<Set<string>>(new Set());
  const [showForwardModal, setShowForwardModal] = useState(false);
  const [showDeleteMenu, setShowDeleteMenu] = useState(false);
  const [confirmAction, setConfirmAction] = useState<{ message: string; action: () => void } | null>(null);
  const [activeGroupCallParticipants, setActiveGroupCallParticipants] = useState<string[]>([]);
  const [isBlocked, setIsBlocked] = useState(false);
  const [blockedByOther, setBlockedByOther] = useState(false);
  const [showBlockModal, setShowBlockModal] = useState(false);
  const [deleteChat, setDeleteChat] = useState(false);
  const [showDeleteChatModal, setShowDeleteChatModal] = useState(false);

  // Background modal state
  const [showBackgroundModal, setShowBackgroundModal] = useState(false);
  const [backgroundPreview, setBackgroundPreview] = useState<string | null>(null);
  const [backgroundBlur, setBackgroundBlur] = useState(0);
  const bgFileInputRef = useRef<HTMLInputElement>(null);

  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const topMenuRef = useRef<HTMLDivElement>(null);
  const deleteMenuRef = useRef<HTMLDivElement>(null);
  const chatViewRef = useRef<HTMLDivElement>(null);

  const [isMobile, setIsMobile] = useState(() => typeof window !== 'undefined' && window.innerWidth < 768);

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  // Swipe to close on mobile
  const [touchStart, setTouchStart] = useState<number | null>(null);
  const [touchEnd, setTouchEnd] = useState<number | null>(null);
  const [swipeOffset, setSwipeOffset] = useState(0);

  const minSwipeDistance = 80;

  const onTouchStart = (e: React.TouchEvent) => {
    if (!isMobile) return;
    // Only handle touches on the header area for swipe-to-close
    const target = e.target as HTMLElement;
    const header = target.closest('.chat-header');
    if (!header) return;

    // Don't interfere with message swipe-to-reply
    if ((e.target as HTMLElement).closest('[data-swiping]')) return;

    setTouchEnd(null);
    setTouchStart(e.targetTouches[0].clientX);
  };

  const onTouchMove = (e: React.TouchEvent) => {
    if (!isMobile || !touchStart) return;
    // Don't interfere with message swipe-to-reply
    const target = e.target as HTMLElement;
    if (target.closest('[data-swiping]')) return;

    const currentTouch = e.targetTouches[0].clientX;
    setTouchEnd(currentTouch);
    const distance = currentTouch - touchStart;
    // Only allow right swipe (positive distance)
    if (distance > 0) {
      setSwipeOffset(Math.min(distance, 150));
    }
  };

  const onTouchEnd = () => {
    if (!touchStart || !touchEnd || !isMobile) {
      setSwipeOffset(0);
      return;
    }
    const distance = touchEnd - touchStart;
    if (distance > minSwipeDistance) {
      setActiveChat(null);
    }
    setSwipeOffset(0);
    setTouchStart(null);
    setTouchEnd(null);
  };

  const chat = chats.find((c) => c.id === activeChat);
  const chatMessages = activeChat ? messages[activeChat] || [] : [];
  const pinnedMsg = activeChat ? pinnedMessages[activeChat] : null;

  // Количество непрочитанных сообщений (для бейджика)
  const unreadCount = chatMessages.filter(
    (m) => m.senderId !== user?.id && !m.readBy?.some((r) => r.userId === user?.id)
  ).length;

  const otherMember = chat?.members.find((m) => m.user.id !== user?.id);
  const isFavorites = chat?.type === 'favorites';
  const chatName = isFavorites
    ? t('favorites')
    : chat?.type === 'personal'
      ? otherMember?.user.displayName || otherMember?.user.username || t('chat')
      : chat?.name || t('group');
  const chatAvatar = isFavorites
    ? null
    : chat?.type === 'personal'
      ? otherMember?.user.avatar
      : chat?.avatar;
  const isOnline = chat?.type === 'personal' && otherMember?.user.isOnline;

  const typingInChat = typingUsers.filter((t) => t.chatId === activeChat && t.userId !== user?.id);

  // Load muted state
  useEffect(() => {
    if (activeChat) {
      setMuted(isChatMuted(activeChat));
      setActiveGroupCallParticipants([]);
      setIsBlocked(false);
      setBlockedByOther(false);

      // Check if blocked in personal chats
      if (chat?.type === 'personal' && otherMember) {
        api.isUserBlocked(otherMember.user.id).then(data => {
          setIsBlocked(data.blocked);
        }).catch(() => {});
      }
    }
  }, [activeChat, chat?.type, otherMember]);

  // Listen for active group calls
  useEffect(() => {
    const socket = getSocket();
    if (!socket) return;
    const handler = (data: { chatId: string; participants: string[] }) => {
      if (data.chatId === activeChat) {
        setActiveGroupCallParticipants(data.participants.filter(p => p !== user?.id));
      }
    };
    socket.on('group_call_active', handler);
    // Request current status when opening a group chat
    if (activeChat && chat?.type === 'group') {
      socket.emit('group_call_status', { chatId: activeChat });
    }
    return () => { socket.off('group_call_active', handler); };
  }, [activeChat, user?.id, chat?.type]);

  // Listen for block/unblock events
  useEffect(() => {
    const socket = getSocket();
    if (!socket) return;

    const handleBlockedYou = (data: { userId: string }) => {
      if (chat?.type === 'personal' && otherMember?.user.id === data.userId) {
        setBlockedByOther(true);
        // Update chat member info to hide avatar
        const updatedChats = chats.map(c => {
          if (c.id === activeChat) {
            return {
              ...c,
              members: c.members.map(m => {
                if (m.user.id === data.userId) {
                  return {
                    ...m,
                    user: {
                      ...m.user,
                      avatar: null,
                      isOnline: false,
                      lastSeen: '2020-01-01T00:00:00.000Z',
                    },
                  };
                }
                return m;
              }),
            };
          }
          return c;
        });
        useChatStore.setState({ chats: updatedChats });
      }
    };

    const handleUnblockedYou = (data: { userId: string }) => {
      if (chat?.type === 'personal' && otherMember?.user.id === data.userId) {
        setBlockedByOther(false);
        // Reload chat to get real user data
        if (activeChat) {
          api.getChats().then(newChats => {
            useChatStore.setState({ chats: newChats });
          });
        }
      }
    };

    socket.on('user_blocked_you', handleBlockedYou);
    socket.on('user_unblocked_you', handleUnblockedYou);

    return () => {
      socket.off('user_blocked_you', handleBlockedYou);
      socket.off('user_unblocked_you', handleUnblockedYou);
    };
  }, [activeChat, chat?.type, otherMember?.user.id, chats]);

  // Close top menu on click outside
  useEffect(() => {
    if (!showTopMenu) return;

    let timer: ReturnType<typeof setTimeout>;

    const onDocClick = (e: MouseEvent) => {
      if (topMenuRef.current && !topMenuRef.current.contains(e.target as Node)) {
        setShowTopMenu(false);
      }
    };

    // Delay so the button's own click doesn't immediately close the menu
    timer = setTimeout(() => {
      document.addEventListener('click', onDocClick);
    }, 150);

    return () => {
      clearTimeout(timer);
      document.removeEventListener('click', onDocClick);
    };
  }, [showTopMenu]);

  // Close delete menu on click outside
  useEffect(() => {
    if (!showDeleteMenu) return;
    const handleClick = (e: MouseEvent) => {
      if (deleteMenuRef.current && !deleteMenuRef.current.contains(e.target as Node)) {
        setShowDeleteMenu(false);
      }
    };
    const timer = setTimeout(() => document.addEventListener('click', handleClick), 0);
    return () => {
      clearTimeout(timer);
      document.removeEventListener('click', handleClick);
    };
  }, [showDeleteMenu]);

  // Прокрутка вниз — через прямой DOM scroll (надёжнее virtualizer.scrollToIndex)
  const scrollToBottom = useCallback((smooth = true) => {
    const container = messagesContainerRef.current;
    if (container) {
      const scrollEl = container.querySelector('[data-scroll-area]') || container;
      if (smooth) {
        scrollEl.scrollTo({ top: scrollEl.scrollHeight, behavior: 'smooth' });
      } else {
        scrollEl.scrollTop = scrollEl.scrollHeight;
      }
    }
  }, []);

  // Первичная прокрутка при открытии чата — useLayoutEffect, до paint
  useLayoutEffect(() => {
    if (activeChat && chatMessages.length > 0) {
      const container = messagesContainerRef.current;
      if (container) {
        const scrollEl = container.querySelector('[data-scroll-area]') || container;
        const savedPos = scrollPositions[activeChat];
        if (savedPos !== undefined && savedPos > 0) {
          scrollEl.scrollTop = savedPos;
        } else {
          scrollEl.scrollTop = scrollEl.scrollHeight;
        }
      }
    }
  }, [activeChat, isLoadingMessages, chatMessages.length]);

  // Слушаем кастомное событие «прокрутить вниз» (отправляется из MessageInput при send)
  useEffect(() => {
    const handler = () => {
      const container = messagesContainerRef.current;
      if (!container) return;
      const scrollEl = container.querySelector('[data-scroll-area]') || container;
      // Immediate
      scrollEl.scrollTop = scrollEl.scrollHeight;
      // Retry — virtualizer might need a frame to render new item
      requestAnimationFrame(() => {
        scrollEl.scrollTop = scrollEl.scrollHeight;
      });
      setTimeout(() => {
        scrollEl.scrollTop = scrollEl.scrollHeight;
      }, 100);
    };
    window.addEventListener('vortex:scroll-to-bottom', handler);
    return () => window.removeEventListener('vortex:scroll-to-bottom', handler);
  }, []);

  // Scroll on new message arrivals
  useEffect(() => {
    if (chatMessages.length === 0) return;
    const container = messagesContainerRef.current;
    if (!container) return;

    const lastMsg = chatMessages[chatMessages.length - 1];
    const scrollEl = container.querySelector('[data-scroll-area]') || container;
    const distanceFromBottom = scrollEl.scrollHeight - scrollEl.scrollTop - scrollEl.clientHeight;

    if (lastMsg.senderId === user?.id || distanceFromBottom < 400) {
      // My message or near bottom — scroll down
      requestAnimationFrame(() => {
        scrollEl.scrollTop = scrollEl.scrollHeight;
      });
    }
  }, [chatMessages.length, user?.id]);

  // Read receipts — debounced via ref to avoid excessive emits
  const sentReadIdsRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (!activeChat || !user?.id) return;
    // Reset tracked IDs when switching chats
    sentReadIdsRef.current.clear();
  }, [activeChat, user?.id]);

  useEffect(() => {
    if (!activeChat || !user?.id) return;
    const unread = chatMessages.filter(
      (m) => m.senderId !== user.id && !m.readBy?.some((r) => r.userId === user.id) && !sentReadIdsRef.current.has(m.id)
    );
    if (unread.length > 0) {
      const ids = unread.map((m) => m.id);
      ids.forEach((id) => sentReadIdsRef.current.add(id));
      // Try socket first, fall back to REST API
      const socket = getSocket();
      if (socket?.connected) {
        socket.emit('read_messages', {
          chatId: activeChat,
          messageIds: ids,
        });
      } else {
        // Socket not connected yet (e.g. page just loaded) — use REST API
        api.markMessagesRead(activeChat, ids).catch(() => {});
      }
      // Update local store immediately for current user
      useChatStore.getState().markRead(activeChat, user.id, ids);
    }
  }, [chatMessages.length, activeChat, user?.id]);

  // Scroll detection — теперь вызывается из VirtualizedMessages на внутреннем контейнере
  const handleMessagesScroll = useCallback((isNearBottom: boolean) => {
    setShowScrollDown(!isNearBottom);
  }, []);

  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (!chatViewRef.current) return;
    const { left, top } = chatViewRef.current.getBoundingClientRect();
    chatViewRef.current.style.setProperty('--mouse-x', `${e.clientX - left}px`);
    chatViewRef.current.style.setProperty('--mouse-y', `${e.clientY - top}px`);
  }, []);

  // Поиск сообщений
  useEffect(() => {
    if (!searchText.trim() || !activeChat) {
      setSearchResults([]);
      return;
    }
    const timer = setTimeout(async () => {
      try {
        const results = await api.searchMessages(searchText, activeChat);
        setSearchResults(results);
      } catch (e) {
        console.error(e);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [searchText, activeChat]);

  // Ctrl+F / Cmd+F for search
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
        e.preventDefault();
        setShowSearch(true);
        setTimeout(() => searchInputRef.current?.focus(), 100);
      }
      if (e.key === 'Escape' && showSearch) {
        setShowSearch(false);
        setSearchText('');
        setSearchResults([]);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [showSearch]);

  const openSearch = useCallback(() => {
    setShowSearch(true);
    setShowTopMenu(false);
    setTimeout(() => searchInputRef.current?.focus(), 100);
  }, []);

  const handleToggleSelect = useCallback((msgId: string) => {
    setSelectedMessages(prev => {
      const newMap = new Set(prev);
      if (newMap.has(msgId)) {
        newMap.delete(msgId);
        if (newMap.size === 0) setSelectionMode(false);
      } else {
        newMap.add(msgId);
      }
      return newMap;
    });
  }, []);

  const handleStartSelection = useCallback((msgId: string) => {
    setSelectionMode(true);
    setSelectedMessages(new Set([msgId]));
  }, []);

  const handleViewProfile = useCallback((userId: string) => {
    onOpenProfile?.(userId);
  }, []);

  const handleUnblock = useCallback(async () => {
    if (!otherMember) return;
    try {
      await api.unblockUser(otherMember.user.id);
      setIsBlocked(false);
      const socket = getSocket();
      if (socket) socket.emit('user_unblocked', { userId: otherMember.user.id });
    } catch (e) { console.error(e); }
  }, [otherMember]);

  const handleLoadMore = useCallback(() => {
    if (activeChat) loadMoreMessages(activeChat);
  }, [activeChat, loadMoreMessages]);

  if (!activeChat || !chat) {
    return (
      <motion.div
        initial={false}
        animate={isMobile ? { x: '100%', opacity: 0 } : { x: '0%', opacity: 1 }}
        transition={{ type: 'spring', stiffness: 400, damping: 35, mass: 0.8 }}
        className={`flex-1 min-w-0 flex items-center justify-center bg-surface-secondary/50 rounded-none md:rounded-[2rem] overflow-hidden border-0 md:border md:border-white/5 shadow-none md:shadow-2xl relative backdrop-blur-3xl group ${isMobile ? 'absolute inset-0' : 'relative'} z-10`}
        style={isMobile ? { pointerEvents: 'none' } : undefined}
      >
        {/* Slowly pulsing purple background as requested */}
        <div className="absolute inset-0 pointer-events-none overflow-hidden transition-opacity duration-[10000ms]">
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[60vw] h-[60vw] max-w-[800px] max-h-[800px] bg-vortex-600/10 rounded-full blur-[120px] animate-[pulse_8s_ease-in-out_infinite]" />
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[40vw] h-[40vw] max-w-[500px] max-h-[500px] bg-purple-600/15 rounded-full blur-[100px] animate-[pulse_12s_ease-in-out_infinite_reverse]" />
        </div>

        <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjAiIGhlaWdodD0iMjAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PGNpcmNsZSBjeD0iMSIgY3k9IjEiIHI9IjEiIGZpbGw9InJnYmEoMjU1LDI1NSwyNTUsMC4wMSkvPjwvc3ZnPg==')] [mask-image:radial-gradient(ellipse_at_center,black_40%,transparent_100%)] opacity-20 pointer-events-none" />

        <div className="text-center relative z-10 w-full max-w-sm px-6">
          <motion.div
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
            className="w-28 h-28 mx-auto mb-8 rounded-[2rem] bg-gradient-to-br from-vortex-500/20 to-purple-600/20 flex items-center justify-center shadow-[0_0_60px_-15px_var(--color-accent)] ring-1 ring-white/10 backdrop-blur-2xl relative"
          >
            <div className="absolute inset-0 rounded-[2rem] bg-gradient-to-br from-white/[0.05] to-transparent pointer-events-none" />
            <img src="/logo.png" alt="Vortex" className="w-16 h-16 rounded-2xl object-cover shadow-2xl transform hover:scale-105 transition-transform" />
          </motion.div>
          <motion.h2
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ duration: 0.6, delay: 0.1, ease: [0.16, 1, 0.3, 1] }}
            className="text-3xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-vortex-400 via-fuchsia-400 to-indigo-400 mb-4 drop-shadow-lg tracking-tight"
          >
            Talk Messenger
          </motion.h2>
          <motion.p
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ duration: 0.6, delay: 0.2, ease: [0.16, 1, 0.3, 1] }}
            className="text-sm font-medium text-zinc-300 bg-white/5 backdrop-blur-lg py-2.5 px-6 rounded-full inline-flex border border-white/10 shadow-lg"
          >
            {t('selectChat')}
          </motion.p>
        </div>
      </motion.div>
    );
  }

  const initials = chatName
    .split(' ')
    .map((w: string) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  const handleReplySelected = () => {
    if (selectedMessages.size !== 1) return;
    const msgId = Array.from(selectedMessages)[0];
    const msg = chatMessages.find(m => m.id === msgId);
    if (msg) {
      setReplyTo(msg);
      setSelectionMode(false);
      setSelectedMessages(new Set());
    }
  };

  const handleForward = async (targetChatId: string) => {
    const socket = getSocket();
    if (!socket || !activeChat) return;

    const messagesToForward = Array.from(selectedMessages)
      .map(id => chatMessages.find(m => m.id === id))
      .filter(Boolean)
      .sort((a, b) => new Date(a!.createdAt).getTime() - new Date(b!.createdAt).getTime());

    messagesToForward.forEach(msg => {
      socket.emit('send_message', {
        chatId: targetChatId,
        content: msg?.content,
        type: msg?.type,
        forwardedFromId: msg?.sender.id,
        mediaUrl: msg?.media?.[0]?.url,
        mediaType: msg?.media?.[0]?.type,
        fileName: msg?.media?.[0]?.filename,
        fileSize: msg?.media?.[0]?.size ?? undefined,
      });
    });

    setSelectionMode(false);
    setSelectedMessages(new Set());
    setShowForwardModal(false);

    // Switch to target chat and reload messages to show forwarded messages immediately
    setActiveChat(targetChatId);

    // Wait a bit for socket messages to arrive, then reload
    setTimeout(async () => {
      try {
        await useChatStore.getState().loadMessages(targetChatId);
      } catch (e) {
        console.error('Failed to reload messages:', e);
      }
    }, 300);
  };

  const handleBulkDelete = (deleteForAll: boolean) => {
    const socket = getSocket();
    if (!socket || !activeChat) return;

    const ids = Array.from(selectedMessages);
    socket.emit('delete_messages', {
      messageIds: ids,
      chatId: activeChat,
      deleteForAll,
    });

    // Optimistic local removal
    if (!deleteForAll) {
      useChatStore.getState().hideMessages(ids, activeChat);
    }

    setSelectionMode(false);
    setSelectedMessages(new Set());
    setShowDeleteMenu(false);
  };

  const handleBlockUser = async () => {
    if (!otherMember) return;

    try {
      const otherUserId = otherMember.user.id;
      const chatIdToDelete = deleteChat && activeChat ? activeChat : null;

      // Remove friendship if exists
      const friendStatus = await api.getFriendshipStatus(otherUserId).catch(() => null);
      if (friendStatus?.status === 'accepted' && friendStatus.friendshipId) {
        await api.removeFriend(friendStatus.friendshipId);
        const socket = getSocket();
        if (socket) socket.emit('friend_removed', { friendId: otherUserId });
      }

      // Block user
      await api.blockUser(otherUserId);
      setIsBlocked(true);

      const socket = getSocket();
      if (socket) socket.emit('user_blocked', { userId: otherUserId });

      // Delete chat if requested
      if (chatIdToDelete) {
        await api.deleteChat(chatIdToDelete);
        useChatStore.getState().removeChat(chatIdToDelete);

        // Notify other user to remove chat
        if (socket) {
          socket.emit('delete_chat_for_user', { chatId: chatIdToDelete, userId: otherUserId });
        }

        setActiveChat(null);
      }

      setShowBlockModal(false);
      setDeleteChat(false);
    } catch (e) {
      console.error(e);
    }
  };

  const handleBackgroundUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 50 * 1024 * 1024) {
      alert(t('fileTooLarge'));
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const base64 = reader.result as string;
      setBackgroundPreview(base64);
    };
    reader.readAsDataURL(file);
  };

  const handleSetBackground = () => {
    if (!backgroundPreview || !activeChat) return;
    setChatBackground(activeChat, { url: backgroundPreview, blur: backgroundBlur });
    setShowBackgroundModal(false);
    setBackgroundPreview(null);
    setBackgroundBlur(0);
  };

  const handleRemoveBackground = () => {
    if (!activeChat) return;
    setChatBackground(activeChat, null);
    setShowBackgroundModal(false);
    setBackgroundPreview(null);
    setBackgroundBlur(0);
  };

  const currentBackground = activeChat ? getChatBackground(activeChat) : null;

  return (
    <motion.div
      ref={chatViewRef}
      onMouseMove={handleMouseMove}
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
      initial={false}
      animate={isMobile ? {
        x: activeChat ? swipeOffset : '100%',
        opacity: activeChat ? Math.max(0.5, 1 - swipeOffset / 150) : 0
      } : { x: '0%', opacity: 1 }}
      transition={swipeOffset > 0
        ? { type: 'tween', duration: 0 }
        : { type: 'tween', duration: 0.15, ease: [0.25, 1, 0.5, 1] }
      }
      style={{ willChange: 'transform, opacity' }}
      className={`flex-1 min-w-0 flex flex-col h-full rounded-none md:rounded-3xl overflow-hidden shadow-none md:shadow-[0_0_120px_-20px_rgba(0,0,0,0.5)] border-0 md:border md:border-border/50 relative ${activeChat ? `chat-theme-${chatTheme}` : 'bg-surface'} transition-colors duration-500 ${isMobile ? 'absolute inset-0' : 'relative'} z-30 bg-surface`}
    >
      {/* Шапка чата */}
      {selectionMode ? (
        <motion.div
          initial={{ y: -20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ type: 'spring', stiffness: 400, damping: 25 }}
          className="h-[68px] md:h-[76px] flex items-center justify-between px-4 md:px-6 border-b border-border/40 bg-surface-secondary/80 backdrop-blur-xl z-20 flex-shrink-0"
        >
          <div className="flex items-center gap-4 text-white">
            <button onClick={() => { setSelectionMode(false); setSelectedMessages(new Set()); }} className="p-2 -ml-2 rounded-full hover:bg-white/10 transition">
              <X size={20} className="text-zinc-300" />
            </button>
            <AnimatePresence mode="popLayout">
              <motion.span
                key={selectedMessages.size}
                initial={{ y: -10, opacity: 0, scale: 0.8 }}
                animate={{ y: 0, opacity: 1, scale: 1 }}
                exit={{ y: 10, opacity: 0, scale: 0.8 }}
                transition={{ type: 'spring', stiffness: 500, damping: 30 }}
                className="font-medium text-[15px] tabular-nums"
              >
                {selectedMessages.size} {t('selected') || 'выбрано'}
              </motion.span>
            </AnimatePresence>
          </div>
          <div className="flex items-center gap-3">
            {/* Кнопка удаления с выпадающим меню */}
            <div className="relative" ref={deleteMenuRef}>
              <button
                disabled={selectedMessages.size === 0}
                onClick={() => setShowDeleteMenu(!showDeleteMenu)}
                className="flex items-center gap-2 px-4 py-2 bg-red-500/90 text-white font-medium rounded-xl hover:bg-red-600 transition-colors disabled:opacity-50"
              >
                <Trash2 size={18} />
                <span className="hidden md:inline">{t('delete')}</span>
              </button>
              <AnimatePresence>
                {showDeleteMenu && (
                  <motion.div
                    initial={{ opacity: 0, scale: 0.95, y: -5 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95, y: -5 }}
                    transition={{ duration: 0.15 }}
                    className="absolute right-0 top-full mt-2 w-56 rounded-2xl bg-surface-secondary/95 backdrop-blur-2xl shadow-2xl z-50 py-1.5 ring-1 ring-border/50 overflow-hidden"
                  >
                    <button
                      onClick={() => handleBulkDelete(false)}
                      className="flex items-center gap-3 w-full px-4 py-3 text-sm text-zinc-300 hover:bg-surface-hover hover:text-white transition-colors"
                    >
                      <Trash2 size={16} className="text-zinc-400" />
                      {t('deleteForMe')}
                    </button>
                    <div className="border-t border-border/30 mx-3" />
                    <button
                      onClick={() => handleBulkDelete(true)}
                      className="flex items-center gap-3 w-full px-4 py-3 text-sm text-red-400 hover:bg-red-500/10 hover:text-red-300 transition-colors"
                    >
                      <Trash2 size={16} className="text-red-400" />
                      {t('deleteForAll')}
                    </button>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
            <button
              disabled={selectedMessages.size === 0}
              onClick={() => setShowForwardModal(true)}
              className="flex items-center gap-2 px-4 py-2 bg-white text-black font-medium rounded-xl hover:bg-zinc-200 transition-colors disabled:opacity-50"
            >
              <Forward size={18} />
              <span className="hidden md:inline">{t('forward')}</span>
            </button>
          </div>
        </motion.div>
      ) : (
        <motion.div
          initial={{ y: -20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ type: 'spring', stiffness: 400, damping: 25 }}
          className="chat-header h-[68px] md:h-[76px] flex items-center justify-between px-4 md:px-6 border-b border-border/40 bg-surface-secondary/80 backdrop-blur-xl z-20 flex-shrink-0"
        >
          {/* Back button */}
          <Tooltip text={t('back') || 'Назад'} shortcut="Esc">
            <motion.button
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -10 }}
              transition={{ duration: 0.2 }}
              onClick={() => setActiveChat(null)}
              className="p-2.5 rounded-xl hover:bg-surface-hover active:scale-95 transition-all text-zinc-400 hover:text-white mr-2"
            >
              <ArrowLeft size={22} strokeWidth={2.5} />
            </motion.button>
          </Tooltip>
          <button
            className="flex items-center gap-3 min-w-0 flex-1 group transition-all overflow-hidden"
            onClick={() => {
              if (chat.type === 'personal' && otherMember) {
                onOpenProfile?.(otherMember.user.id);
              } else if (chat.type === 'group') {
                setShowGroupSettings(true);
              }
            }}
          >
            <div className="relative flex-shrink-0 transform transition-transform duration-300 group-hover:scale-105">
              {isFavorites ? (
                <div className="w-11 h-11 rounded-full bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center shadow-lg ring-2 ring-transparent group-hover:ring-accent/30 transition-all duration-300">
                  <Bookmark size={20} className="text-white" />
                </div>
              ) : blockedByOther ? (
                <div className="w-11 h-11 rounded-full bg-zinc-700 flex items-center justify-center shadow-lg ring-2 ring-transparent transition-all duration-300">
                  <span className="text-zinc-500 text-lg font-bold">{initials}</span>
                </div>
              ) : (
                <Avatar
                  src={chatAvatar}
                  name={chatName}
                  size="md"
                  online={isOnline ? true : undefined}
                  className="ring-2 ring-transparent group-hover:ring-accent/30 transition-all duration-300 rounded-full"
                />
              )}
            </div>
            <div className="min-w-0 text-left overflow-hidden">
              <h3 className="text-base font-semibold text-white truncate drop-shadow-sm group-hover:text-accent/90 transition-colors">{chatName}</h3>
              <p className="text-xs text-zinc-400 truncate">
                {isFavorites
                  ? t('favoritesDescription')
                  : blockedByOther
                    ? <span className="text-zinc-500">{t('wasRecently')}</span>
                    : typingInChat.length > 0
                      ? <span className="text-accent font-medium">{t('typing')}</span>
                      : isOnline
                        ? <span className="text-emerald-400">{t('online')}</span>
                        : chat.type === 'personal' && otherMember?.user.lastSeen
                          ? `${t('lastSeenAt')} ${formatLastSeen(otherMember.user.lastSeen, lang)}`
                          : chat.type === 'group'
                            ? `${chat.members.length} ${t('members')}`
                            : ''}
              </p>
            </div>
          </button>

          <div className="flex items-center gap-1 md:gap-1.5 ml-2 md:ml-4 flex-shrink-0 overflow-hidden">
            {/* Кнопка звонка для мобильных */}
            {!isFavorites && chat.type === 'personal' && otherMember && (
              <button
                onClick={() => onStartCall?.(otherMember.user, 'voice')}
                className="md:hidden p-2.5 rounded-xl hover:bg-surface-hover active:scale-95 transition-all text-zinc-400 hover:text-white"
                title={t('call')}
              >
                <Phone size={20} strokeWidth={2.5} />
              </button>
            )}

            {/* Поиск */}
            <AnimatePresence>
              {showSearch && (
                <motion.div
                  initial={{ width: 0, opacity: 0 }}
                  animate={{ width: 200, opacity: 1 }}
                  exit={{ width: 0, opacity: 0 }}
                  className="overflow-hidden hidden md:block"
                >
                  <input
                    ref={searchInputRef}
                    type="text"
                    placeholder={t('searchMessages')}
                    value={searchText}
                    onChange={(e) => setSearchText(e.target.value)}
                    className="w-full px-3 py-1.5 rounded-lg bg-surface-tertiary text-sm text-white placeholder-zinc-500 border border-border focus:border-accent"
                  />
                </motion.div>
              )}
            </AnimatePresence>

            <Tooltip text={showSearch ? (t('close') || 'Закрыть') : (t('searchMessages') || 'Поиск')} shortcut="Ctrl+F">
              <button
                onClick={() => {
                  if (showSearch) {
                    setShowSearch(false);
                    setSearchText('');
                    setSearchResults([]);
                  } else {
                    openSearch();
                  }
                }}
                className="p-2 rounded-lg hover:bg-surface-hover transition-colors text-zinc-400 hover:text-white hidden md:block"
              >
                {showSearch ? <X size={18} /> : <Search size={18} />}
              </button>
            </Tooltip>

            {!isFavorites && (
              <>
                <Tooltip text={t('call') || 'Начать голосовой звонок'}>
                  <button
                    onClick={() => {
                      if (chat.type === 'personal' && otherMember) {
                        onStartCall?.(otherMember.user, 'voice');
                      } else if (chat.type === 'group') {
                        onStartGroupCall?.(chat.id, chat.name || 'Group', 'voice');
                      }
                    }}
                    className="p-2 rounded-lg hover:bg-surface-hover transition-colors text-zinc-400 hover:text-white hidden md:block"
                  >
                    <Phone size={18} />
                  </button>
                </Tooltip>
                <Tooltip text={t('videoCall') || 'Начать видеозвонок'}>
                  <button
                    onClick={() => {
                      if (chat.type === 'personal' && otherMember) {
                        onStartCall?.(otherMember.user, 'video');
                      } else if (chat.type === 'group') {
                        onStartGroupCall?.(chat.id, chat.name || 'Group', 'video');
                      }
                    }}
                    className="p-2 rounded-lg hover:bg-surface-hover transition-colors text-zinc-400 hover:text-white hidden md:block"
                  >
                    <Video size={18} />
                  </button>
                </Tooltip>
              </>
            )}
          </div>

          {/* Меню (вынесено за overflow-hidden контейнер) */}
          <div ref={topMenuRef} className="relative flex-shrink-0 ml-1">
            <Tooltip text={t('menu') || 'Меню'}>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setShowTopMenu(v => !v);
                }}
                className="p-2 rounded-lg hover:bg-surface-hover transition-colors text-zinc-400 hover:text-white"
              >
                <MoreVertical size={18} />
              </button>
            </Tooltip>
            <AnimatePresence>
              {showTopMenu && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.95, y: -5 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95, y: -5 }}
                  transition={{ duration: 0.15 }}
                  className="absolute right-0 top-full mt-2 w-56 rounded-2xl glass-strong shadow-2xl z-50 py-1.5 ring-1 ring-border/50 backdrop-blur-2xl"
                  onClick={(e) => e.stopPropagation()}
                >
                    <button
                      onClick={openSearch}
                      className="flex items-center gap-3 w-full px-4 py-2.5 text-sm text-zinc-300 hover:bg-surface-hover hover:text-white transition-colors"
                    >
                      <Search size={16} />
                      {t('searchMessages')}
                    </button>
                    {chat.type === 'personal' && otherMember && (
                      <button
                        onClick={() => {
                          setShowTopMenu(false);
                          onOpenProfile?.(otherMember.user.id);
                        }}
                        className="flex items-center gap-3 w-full px-4 py-2.5 text-sm text-zinc-300 hover:bg-surface-hover hover:text-white transition-colors"
                      >
                        <UserPlus size={16} />
                        {t('userProfile')}
                      </button>
                    )}
                    <button
                      onClick={() => {
                        if (activeChat) {
                          const nowMuted = toggleMuteChat(activeChat);
                          setMuted(nowMuted);
                        }
                      }}
                      className="flex items-center gap-3 w-full px-4 py-2.5 text-sm text-zinc-300 hover:bg-surface-hover hover:text-white transition-colors"
                    >
                      {muted ? <Bell size={16} /> : <BellOff size={16} />}
                      {muted ? t('enableSound') : t('disableSound')}
                    </button>
                    <button
                      onClick={() => {
                        setShowTopMenu(false);
                        setShowBackgroundModal(true);
                        const bg = currentBackground;
                        if (bg) {
                          setBackgroundPreview(bg.url);
                          setBackgroundBlur(bg.blur);
                        }
                      }}
                      className="flex items-center gap-3 w-full px-4 py-2.5 text-sm text-zinc-300 hover:bg-surface-hover hover:text-white transition-colors"
                    >
                      <Image size={16} />
                      {t('chatBackground')}
                    </button>
                    {chat.type === 'group' && (
                      <button
                        onClick={() => {
                          setShowTopMenu(false);
                          setShowGroupSettings(true);
                        }}
                        className="flex items-center gap-3 w-full px-4 py-2.5 text-sm text-zinc-300 hover:bg-surface-hover hover:text-white transition-colors"
                      >
                        <Settings size={16} />
                        {t('groupSettings')}
                      </button>
                    )}
                    <div className="border-t border-border my-1" />
                    {chat.type === 'personal' && otherMember && !isBlocked && (
                      <button
                        onClick={() => {
                          setShowTopMenu(false);
                          setShowBlockModal(true);
                        }}
                        className="flex items-center gap-3 w-full px-4 py-2.5 text-sm text-red-400 hover:bg-red-500/10 transition-colors"
                      >
                        <Ban size={16} />
                        {t('blockUser')}
                      </button>
                    )}
                    {chat.type === 'personal' && otherMember && isBlocked && (
                      <button
                        onClick={async () => {
                          setShowTopMenu(false);
                          try {
                            await api.unblockUser(otherMember.user.id);
                            setIsBlocked(false);
                            const socket = getSocket();
                            if (socket) socket.emit('user_unblocked', { userId: otherMember.user.id });
                          } catch (e) {
                            console.error(e);
                          }
                        }}
                        className="flex items-center gap-3 w-full px-4 py-2.5 text-sm text-zinc-300 hover:bg-surface-hover hover:text-white transition-colors"
                      >
                        <Ban size={16} />
                        {t('unblockUser')}
                      </button>
                    )}
                    <button
                      onClick={() => {
                        setShowTopMenu(false);
                        if (activeChat) {
                          setConfirmAction({
                            message: t('clearChatConfirm'),
                            action: async () => {
                              try {
                                await api.clearChat(activeChat);
                                useChatStore.getState().clearMessages(activeChat);
                              } catch (e) {
                                console.error(e);
                              }
                            },
                          });
                        }
                      }}
                      className="flex items-center gap-3 w-full px-4 py-2.5 text-sm text-zinc-300 hover:bg-surface-hover hover:text-white transition-colors"
                    >
                      <Eraser size={16} />
                      {t('clearChat')}
                    </button>
                    <button
                      onClick={() => {
                        setShowTopMenu(false);
                        if (activeChat) {
                          setConfirmAction({
                            message: t('deleteChatConfirm'),
                            action: async () => {
                              try {
                                await api.deleteChat(activeChat);
                                useChatStore.getState().removeChat(activeChat);

                                if (chat.type === 'personal' && otherMember) {
                                  const socket = getSocket();
                                  if (socket) {
                                    socket.emit('delete_chat_for_user', {
                                      chatId: activeChat,
                                      userId: otherMember.user.id
                                    });
                                  }
                                }

                                setActiveChat(null);
                              } catch (e) {
                                console.error(e);
                              }
                            },
                          });
                        }
                      }}
                      className="flex items-center gap-3 w-full px-4 py-2.5 text-sm text-red-400 hover:bg-red-500/10 transition-colors"
                    >
                      <Trash2 size={16} />
                      {t('deleteChat')}
                    </button>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
        </motion.div>
      )}

      {/* Результаты поиска */}
      <AnimatePresence>
        {showSearch && searchResults.length > 0 && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="absolute top-14 left-0 right-0 z-20 max-h-60 overflow-y-auto glass-strong border-b border-border"
          >
            {searchResults.map((msg) => (
              <div
                key={msg.id}
                className="px-4 py-2 hover:bg-surface-hover cursor-pointer border-b border-border/50 last:border-0"
                onClick={() => {
                  // Scroll to message
                  const el = document.getElementById(`msg-${msg.id}`);
                  if (el) {
                    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    el.classList.add('bg-vortex-500/20');
                    setTimeout(() => el.classList.remove('bg-vortex-500/20'), 2000);
                  }
                  setShowSearch(false);
                  setSearchText('');
                  setSearchResults([]);
                }}
              >
                <div className="flex items-center gap-2 mb-0.5">
                  <span className="text-xs font-medium text-vortex-400">
                    {msg.sender?.displayName || msg.sender?.username}
                  </span>
                  <span className="text-xs text-zinc-600">
                    {new Date(msg.createdAt).toLocaleDateString(lang === 'ru' ? 'ru' : 'en')}
                  </span>
                </div>
                <p className="text-sm text-zinc-300 truncate">{msg.content}</p>
              </div>
            ))}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Закреплённое сообщение */}
      {/* Active group call banner */}
      {chat?.type === 'group' && activeGroupCallParticipants.length > 0 && (
        <button
          onClick={() => onStartGroupCall?.(chat.id, chat.name || 'Group', 'voice')}
          className="flex items-center gap-3 px-4 py-2.5 border-b border-border bg-emerald-500/10 hover:bg-emerald-500/20 transition-colors text-left w-full flex-shrink-0"
        >
          <div className="w-8 h-8 rounded-full bg-emerald-500/20 flex items-center justify-center">
            <Phone size={14} className="text-emerald-400" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-medium text-emerald-400">{t('activeCall')}</p>
            <p className="text-sm text-zinc-300">{activeGroupCallParticipants.length} {t('participants')}</p>
          </div>
          <span className="text-xs text-emerald-400 font-medium px-3 py-1 rounded-full bg-emerald-500/20">{t('joinCall')}</span>
        </button>
      )}

      {pinnedMsg && (
        <button
          onClick={() => {
            const el = document.getElementById(`msg-${pinnedMsg.id}`);
            if (el) {
              el.scrollIntoView({ behavior: 'smooth', block: 'center' });
              el.classList.add('bg-vortex-500/20');
              setTimeout(() => el.classList.remove('bg-vortex-500/20'), 2000);
            }
          }}
          className="flex items-center gap-3 px-4 py-2 border-b border-border bg-surface-secondary/60 hover:bg-surface-hover transition-colors text-left w-full flex-shrink-0"
        >
          <Pin size={16} className="text-vortex-400 flex-shrink-0 rotate-45" />
          <div className="min-w-0 flex-1">
            <p className="text-xs font-medium text-vortex-400">{t('pinnedMessage')}</p>
            <p className="text-sm text-zinc-300 truncate">
              {pinnedMsg.content || (pinnedMsg.media?.length > 0 ? t('media') : '...')}
            </p>
          </div>
          <X
            size={16}
            className="text-zinc-500 hover:text-white flex-shrink-0 transition-colors"
            onClick={(e) => {
              e.stopPropagation();
              const socket = getSocket();
              if (socket && activeChat) {
                socket.emit('unpin_message', { messageId: pinnedMsg.id, chatId: activeChat });
              }
            }}
          />
        </button>
      )}

      {/* Сообщения */}
      <div
        ref={messagesContainerRef}
        className="flex-1 relative z-10 min-h-0 overflow-hidden"
      >
        {currentBackground && (
          <div
            className="absolute inset-0 z-0"
            style={{
              backgroundImage: `url(${currentBackground.url})`,
              backgroundSize: 'cover',
              backgroundPosition: 'center',
              backgroundRepeat: 'no-repeat',
              filter: `blur(${currentBackground.blur}px)`,
            }}
          />
        )}
        {isLoadingMessages ? (
          <div className="relative z-10 h-full overflow-auto px-3 md:px-6 pt-4 md:pt-6">
            <MessageSkeleton />
          </div>
        ) : chatMessages.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <p className="text-sm text-zinc-500">{t('noMessages')}</p>
          </div>
        ) : (
          <VirtualizedMessages
            messages={chatMessages}
            user={user}
            lang={lang}
            selectionMode={selectionMode}
            selectedMessages={selectedMessages}
            onViewProfile={handleViewProfile}
            onToggleSelect={handleToggleSelect}
            onStartSelectionMode={handleStartSelection}
            scrollContainerRef={messagesContainerRef}
            chatId={activeChat}
            isLoadingMore={isLoadingMore}
            hasMore={hasMore[activeChat || ''] || false}
            onLoadMore={handleLoadMore}
            onScrollStateChange={handleMessagesScroll}
            onSaveScrollPosition={(pos) => { if (activeChat) saveScrollPosition(activeChat, pos); }}
          />
        )}
      </div>

      {/* Кнопка прокрутки вниз */}
      <AnimatePresence>
        {showScrollDown && (
          <motion.button
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0, opacity: 0 }}
            onClick={() => scrollToBottom()}
            className="absolute bottom-20 right-4 md:right-6 w-11 h-11 rounded-full bg-surface-tertiary/90 backdrop-blur-md border border-border shadow-2xl flex items-center justify-center text-zinc-400 hover:text-white hover:bg-surface-hover hover:scale-105 transition-all z-20"
          >
            <ArrowDown size={20} />
          </motion.button>
        )}
      </AnimatePresence>
      {/* Unread badge — показывается всегда когда есть непрочитанные */}
      <AnimatePresence>
        {!showScrollDown && unreadCount > 0 && (
          <motion.button
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0, opacity: 0 }}
            onClick={() => scrollToBottom()}
            className="absolute bottom-20 right-4 md:right-6 min-w-[44px] h-11 px-3 rounded-full bg-accent/90 backdrop-blur-md shadow-2xl flex items-center justify-center text-white text-sm font-bold hover:bg-accent hover:scale-105 transition-all z-20"
          >
            {unreadCount > 99 ? '99+' : unreadCount}
          </motion.button>
        )}
      </AnimatePresence>

      {/* Typing индикатор */}
      {typingInChat.length > 0 && (
        <div className="px-4 pb-1">
          <TypingIndicator />
        </div>
      )}

      {/* Ввод сообщения */}
      {selectionMode && isMobile ? (
        <motion.div
          initial={{ y: 80, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 80, opacity: 0 }}
          transition={{ type: 'spring', stiffness: 350, damping: 30 }}
          className="flex items-center gap-3 px-4 py-3 border-t border-border/40 bg-surface-secondary/95 backdrop-blur-xl z-20 flex-shrink-0 safe-area-inset-bottom"
        >
          <AnimatePresence>
            {selectedMessages.size <= 1 && (
              <motion.button
                key="reply"
                initial={{ y: 40, opacity: 0, scale: 0.9 }}
                animate={{ y: 0, opacity: 1, scale: 1 }}
                exit={{ y: 40, opacity: 0, scale: 0.9 }}
                transition={{ type: 'spring', stiffness: 400, damping: 25 }}
                onClick={handleReplySelected}
                className="flex-1 flex items-center justify-center gap-2 py-3 bg-vortex-500 text-white font-medium rounded-2xl active:scale-95 transition-all shadow-lg shadow-vortex-500/30"
              >
                <Reply size={20} />
                <span>{t('reply')}</span>
              </motion.button>
            )}
          </AnimatePresence>
          <motion.button
            layout
            initial={{ y: 40, opacity: 0, scale: 0.9 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            transition={{ type: 'spring', stiffness: 400, damping: 25 }}
            onClick={() => setShowForwardModal(true)}
            className="flex-1 flex items-center justify-center gap-2 py-3 bg-white text-black font-medium rounded-2xl active:scale-95 transition-all shadow-lg"
          >
            <Forward size={20} />
            <span>{t('forward')}</span>
          </motion.button>
        </motion.div>
      ) : (
        <MessageInput chatId={activeChat} isBlocked={isBlocked} blockedByOther={blockedByOther} onUnblock={handleUnblock} />
      )}

      {/* Настройки группы */}
      <AnimatePresence>
        {showGroupSettings && chat && chat.type === 'group' && (
          <GroupSettings
            chat={chat}
            onClose={() => setShowGroupSettings(false)}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showForwardModal && (
          <ForwardModal
            onClose={() => setShowForwardModal(false)}
            onForward={handleForward}
          />
        )}
      </AnimatePresence>

      <ConfirmModal
        open={!!confirmAction}
        message={confirmAction?.message || ''}
        onConfirm={() => {
          confirmAction?.action();
          setConfirmAction(null);
        }}
        onCancel={() => setConfirmAction(null)}
      />

      {/* Block confirmation modal */}
      <AnimatePresence>
        {showBlockModal && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100]"
              onClick={() => setShowBlockModal(false)}
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-md z-[101]"
            >
              <div className="bg-surface-secondary border border-border rounded-2xl shadow-2xl p-6 mx-4">
                <h3 className="text-lg font-semibold text-white mb-4">{t('blockUserConfirm')}</h3>

                {activeChat && (
                  <label className="flex items-start gap-3 mb-6 cursor-pointer group p-3 rounded-xl hover:bg-white/5 transition-colors">
                    <div className="relative flex items-center justify-center mt-0.5">
                      <input
                        type="checkbox"
                        checked={deleteChat}
                        onChange={(e) => setDeleteChat(e.target.checked)}
                        className="peer w-5 h-5 rounded-md border-2 border-zinc-600 bg-transparent appearance-none cursor-pointer transition-all checked:bg-accent checked:border-accent"
                      />
                      <Check
                        size={14}
                        className="absolute text-white opacity-0 peer-checked:opacity-100 transition-opacity pointer-events-none"
                      />
                    </div>
                    <div className="flex-1">
                      <span className="text-sm font-medium text-zinc-200 group-hover:text-white transition-colors block">
                        {t('alsoDeleteChat')}
                      </span>
                      <span className="text-xs text-zinc-500 mt-1 block">
                        {t('chatHistoryWillBeDeleted')}
                      </span>
                    </div>
                  </label>
                )}

                <div className="flex gap-3">
                  <button
                    onClick={() => {
                      setShowBlockModal(false);
                      setDeleteChat(false);
                    }}
                    className="flex-1 px-4 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-zinc-300 hover:text-white transition-all text-sm font-medium"
                  >
                    {t('cancel')}
                  </button>
                  <button
                    onClick={handleBlockUser}
                    className="flex-1 px-4 py-2.5 rounded-xl bg-red-500 hover:bg-red-600 text-white transition-all text-sm font-medium"
                  >
                    {t('blockUser')}
                  </button>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Background modal */}
      <AnimatePresence>
        {showBackgroundModal && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100]"
              onClick={() => {
                setShowBackgroundModal(false);
                setBackgroundPreview(null);
                setBackgroundBlur(0);
              }}
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-lg z-[101]"
            >
              <div className="bg-surface-secondary border border-border rounded-2xl shadow-2xl p-6 mx-4">
                <h3 className="text-lg font-semibold text-white mb-4">{t('chatBackground')}</h3>

                {/* Preview */}
                {backgroundPreview && (
                  <div className="relative w-full h-48 rounded-xl overflow-hidden mb-4 border border-border">
                    <div
                      className="absolute inset-0"
                      style={{
                        backgroundImage: `url(${backgroundPreview})`,
                        backgroundSize: 'cover',
                        backgroundPosition: 'center',
                        filter: `blur(${backgroundBlur}px)`,
                      }}
                    />
                    <div className="absolute inset-0 flex items-center justify-center">
                      <div className="bg-white/10 backdrop-blur-sm px-4 py-2 rounded-lg text-white text-sm">
                        {t('message')}
                      </div>
                    </div>
                  </div>
                )}

                {/* Blur slider */}
                {backgroundPreview && (
                  <div className="mb-4">
                    <label className="text-sm text-zinc-400 mb-2 block">
                      Blur: {backgroundBlur}px
                    </label>
                    <input
                      type="range"
                      min="0"
                      max="20"
                      value={backgroundBlur}
                      onChange={(e) => setBackgroundBlur(Number(e.target.value))}
                      className="w-full h-2 bg-surface-tertiary rounded-lg appearance-none cursor-pointer accent-accent"
                    />
                  </div>
                )}

                {/* Hidden file input */}
                <input
                  ref={bgFileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleBackgroundUpload}
                  className="hidden"
                />

                <div className="flex flex-col gap-3">
                  <button
                    onClick={() => bgFileInputRef.current?.click()}
                    className="w-full px-4 py-2.5 rounded-xl bg-accent hover:bg-accent/90 text-white transition-all text-sm font-medium"
                  >
                    {t('uploadBackground')}
                  </button>

                  {backgroundPreview && (
                    <button
                      onClick={handleSetBackground}
                      className="w-full px-4 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white transition-all text-sm font-medium"
                    >
                      {t('save')}
                    </button>
                  )}

                  {currentBackground && (
                    <button
                      onClick={handleRemoveBackground}
                      className="w-full px-4 py-2.5 rounded-xl bg-red-500/20 hover:bg-red-500/30 text-red-400 transition-all text-sm font-medium"
                    >
                      {t('removeBackground')}
                    </button>
                  )}

                  <button
                    onClick={() => {
                      setShowBackgroundModal(false);
                      setBackgroundPreview(null);
                      setBackgroundBlur(0);
                    }}
                    className="w-full px-4 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-zinc-300 hover:text-white transition-all text-sm font-medium"
                  >
                    {t('cancel')}
                  </button>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

function MessageSkeleton() {
  return (
    <div className="flex flex-col gap-3 py-4 max-w-3xl mx-auto">
      {[...Array(8)].map((_, i) => {
        const isMine = i % 3 === 0;
        const widths = ['w-48', 'w-64', 'w-36', 'w-56', 'w-44', 'w-60', 'w-40', 'w-52'];
        const heights = ['h-10', 'h-16', 'h-8', 'h-12', 'h-10', 'h-14', 'h-8', 'h-10'];
        return (
          <div
            key={i}
            className={`flex ${isMine ? 'justify-end' : 'justify-start'}`}
          >
            <div
              className={`${widths[i]} ${heights[i]} rounded-2xl ${
                isMine
                  ? 'bg-vortex-500/15 rounded-br-md'
                  : 'bg-white/[0.06] rounded-bl-md'
              } animate-pulse`}
              style={{
                animationDelay: `${i * 80}ms`,
                animationDuration: '1.5s',
              }}
            />
          </div>
        );
      })}
    </div>
  );
}

interface VirtualizedMessagesProps {
  messages: Message[];
  user: any;
  lang: string;
  selectionMode: boolean;
  selectedMessages: Set<string>;
  onViewProfile: (userId: string) => void;
  onToggleSelect: (msgId: string) => void;
  onStartSelectionMode: (msgId: string) => void;
  scrollContainerRef: React.RefObject<HTMLDivElement | null>;
  chatId: string | null;
  isLoadingMore: boolean;
  hasMore: boolean;
  onLoadMore: () => void;
  onScrollStateChange?: (isNearBottom: boolean) => void;
  onSaveScrollPosition?: (scrollTop: number) => void;
}

const VirtualizedMessages = memo(function VirtualizedMessages({
  messages,
  user,
  lang,
  selectionMode,
  selectedMessages,
  onViewProfile,
  onToggleSelect,
  onStartSelectionMode,
  scrollContainerRef,
  chatId,
  isLoadingMore,
  hasMore,
  onLoadMore,
  onScrollStateChange,
  onSaveScrollPosition,
}: VirtualizedMessagesProps) {
  const scrollElRef = useRef<HTMLDivElement>(null);
  const prevMessageCountRef = useRef(messages.length);
  const prevScrollHeightRef = useRef(0);

  const itemData = useMemo(() => {
    const items: Array<{ type: 'date'; date: string; key: string } | { type: 'message'; msg: Message; showAvatar: boolean; showDate: boolean; key: string }> = [];
    for (let i = 0; i < messages.length; i++) {
      const msg = messages[i];
      const prevMsg = i > 0 ? messages[i - 1] : null;
      const showAvatar = !prevMsg || prevMsg.senderId !== msg.senderId;
      const showDate = !prevMsg ||
        new Date(msg.createdAt).toDateString() !== new Date(prevMsg.createdAt).toDateString();

      if (showDate) {
        const dateStr = new Date(msg.createdAt).toLocaleDateString(lang === 'ru' ? 'ru-RU' : 'en-US', {
          day: 'numeric',
          month: 'long',
        });
        items.push({ type: 'date', date: dateStr, key: `date-${dateStr}-${msg.id}` });
      }
      items.push({ type: 'message', msg, showAvatar, showDate, key: msg.id });
    }
    return items;
  }, [messages, lang]);

  const virtualizer = useVirtualizer({
    count: itemData.length,
    getScrollElement: () => scrollElRef.current,
    estimateSize: (index) => {
      const item = itemData[index];
      if (item.type === 'date') return 44;
      const msg = item.msg;
      const hasMedia = msg.media && msg.media.length > 0;
      const hasContent = !!msg.content;
      if (hasMedia && hasContent) return 200;
      if (hasMedia) return 160;
      if (hasContent && msg.content!.length > 200) return 120;
      return 64;
    },
    overscan: typeof window !== 'undefined' && window.innerWidth < 768 ? 1 : 3,
  });

  // Scroll to bottom on initial load and new messages
  useEffect(() => {
    const el = scrollElRef.current;
    if (!el) return;

    if (messages.length > prevMessageCountRef.current) {
      const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
      if (distanceFromBottom < 400 || messages[messages.length - 1]?.senderId === user?.id) {
        requestAnimationFrame(() => { el.scrollTop = el.scrollHeight; });
      }
    } else if (prevMessageCountRef.current === 0 && itemData.length > 0) {
      el.scrollTop = el.scrollHeight;
    }
    prevMessageCountRef.current = messages.length;
  }, [messages.length, itemData.length, user?.id, messages]);

  // Preserve scroll position when loading more messages at top
  useEffect(() => {
    const el = scrollElRef.current;
    if (!el) return;
    const newScrollHeight = el.scrollHeight;
    const diff = newScrollHeight - prevScrollHeightRef.current;
    if (diff > 0 && isLoadingMore) {
      el.scrollTop += diff;
    }
    prevScrollHeightRef.current = newScrollHeight;
  }, [messages.length, isLoadingMore]);

  // Load more when scrolling near the top
  useEffect(() => {
    const el = scrollElRef.current;
    if (!el || !hasMore || isLoadingMore) return;

    const handleScroll = () => {
      if (el.scrollTop < 200 && hasMore && !isLoadingMore) {
        onLoadMore();
      }
    };

    el.addEventListener('scroll', handleScroll, { passive: true });
    return () => el.removeEventListener('scroll', handleScroll);
  }, [hasMore, isLoadingMore, onLoadMore]);

  // Track scroll state for showScrollDown button + save position
  const handleScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    const el = e.currentTarget;
    if (!el) return;
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    onScrollStateChange?.(distanceFromBottom < 250);
    onSaveScrollPosition?.(el.scrollTop);
  }, [onScrollStateChange, onSaveScrollPosition]);

  return (
    <div
      ref={scrollElRef}
      data-scroll-area
      onScroll={handleScroll}
      className="absolute inset-0 overflow-auto px-3 md:px-6 pt-4 md:pt-6 pb-2"
    >
      {isLoadingMore && (
        <div className="flex justify-center py-3">
          <div className="w-5 h-5 border-2 border-vortex-500 border-t-transparent rounded-full animate-spin" />
        </div>
      )}
      <div
        style={{ height: `${virtualizer.getTotalSize()}px`, width: '100%', position: 'relative' }}
      >
        {virtualizer.getVirtualItems().map((virtualRow) => {
          const item = itemData[virtualRow.index];
          return (
            <div
              key={virtualRow.key}
              data-index={virtualRow.index}
              ref={virtualizer.measureElement}
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                transform: `translateY(${virtualRow.start}px)`,
                containIntrinsicSize: 'auto 64px',
                contentVisibility: 'auto',
              }}
            >
              {item.type === 'date' ? (
                <div className="flex justify-center my-4" id={`msg-${item.key}`}>
                  <span className="px-3 py-1 rounded-full text-xs text-zinc-400 glass">
                    {item.date}
                  </span>
                </div>
              ) : (
                <div id={`msg-${item.msg.id}`} className="transition-colors duration-500">
                  <MessageBubble
                    message={item.msg}
                    isMine={item.msg.senderId === user?.id}
                    showAvatar={item.showAvatar}
                    onViewProfile={onViewProfile}
                    selectionMode={selectionMode}
                    isSelected={selectedMessages.has(item.msg.id)}
                    onToggleSelect={onToggleSelect}
                    onStartSelectionMode={onStartSelectionMode}
                  />
                </div>
              )}
            </div>
          );
        })}
      </div>
      <div className="h-4" />
    </div>
  );
});

