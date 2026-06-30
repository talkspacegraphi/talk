import { create } from 'zustand';
import { api } from '../lib/api';
import { useAuthStore } from './authStore';
import type { Chat, ChatMember, Message, TypingUser } from '../lib/types';

const MAX_MESSAGES_PER_CHAT = 100;

interface ChatState {
  chats: Chat[];
  activeChat: string | null;
  messages: Record<string, Message[]>;
  pinnedMessages: Record<string, Message>;
  typingUsers: TypingUser[];
  replyTo: Message | null;
  editingMessage: Message | null;
  isLoadingChats: boolean;
  isLoadingMessages: boolean;
  isLoadingMore: boolean;
  hasMore: Record<string, boolean>;
  searchQuery: string;
  drafts: Record<string, string>;
  scrollPositions: Record<string, number>;

  setActiveChat: (chatId: string | null) => void;
  saveScrollPosition: (chatId: string, scrollTop: number) => void;
  setSearchQuery: (query: string) => void;
  setDraft: (chatId: string, text: string) => void;
  getDraft: (chatId: string) => string;
  loadChats: () => Promise<void>;
  loadMessages: (chatId: string) => Promise<void>;
  loadMoreMessages: (chatId: string) => Promise<void>;
  addMessage: (message: Message) => void;
  /** Мгновенно добавляет «локальное» сообщение (до ответа сервера) */
  addOptimisticMessage: (message: Message) => void;
  /** Заменяет pending-сообщение с clientId на подтверждённое сервером */
  confirmMessage: (clientId: string, realMessage: Message) => void;
  /** Помечает pending-сообщение как не доставленное */
  failOptimisticMessage: (clientId: string) => void;
  /** Повторно отправляет pending-сообщение */
  retryMessage: (clientId: string) => void;
  /** Получить все pending-сообщения для повторной отправки */
  getPendingMessages: () => Message[];
  updateMessage: (message: Message) => void;
  removeMessage: (messageId: string, chatId: string) => void;
  removeMessages: (messageIds: string[], chatId: string) => void;
  hideMessages: (messageIds: string[], chatId: string) => void;
  addReaction: (messageId: string, chatId: string, userId: string, username: string, emoji: string) => void;
  removeReaction: (messageId: string, chatId: string, userId: string, emoji: string) => void;
  markRead: (chatId: string, userId: string, messageIds: string[]) => void;
  addTypingUser: (chatId: string, userId: string) => void;
  removeTypingUser: (chatId: string, userId: string) => void;
  updateUserOnlineStatus: (userId: string, isOnline: boolean, lastSeen?: string) => void;
  setReplyTo: (message: Message | null) => void;
  setEditingMessage: (message: Message | null) => void;
  addChat: (chat: Chat) => void;
  updateChat: (chat: Chat) => void;
  removeChat: (chatId: string) => void;
  clearMessages: (chatId: string) => void;
  setPinnedMessage: (chatId: string, message: Message) => void;
  removePinnedMessage: (chatId: string, messageId: string, newPinned: Message | null) => void;
  clearStore: () => void;
}

export const useChatStore = create<ChatState>((set, get) => ({
  chats: [],
  activeChat: null,
  messages: {},
  pinnedMessages: {},
  typingUsers: [],
  replyTo: null,
  editingMessage: null,
  isLoadingChats: false,
  isLoadingMessages: false,
  isLoadingMore: false,
  hasMore: {},
  searchQuery: '',
  drafts: JSON.parse(localStorage.getItem('vortex_drafts') || '{}'),
  scrollPositions: {},

  setActiveChat: (chatId) => set((state) => {
    // Trim messages from the previous active chat to save memory
    const prevChatId = state.activeChat;
    const messages = { ...state.messages };
    if (prevChatId && prevChatId !== chatId && messages[prevChatId]?.length > MAX_MESSAGES_PER_CHAT) {
      messages[prevChatId] = messages[prevChatId].slice(-MAX_MESSAGES_PER_CHAT);
    }

    return {
      activeChat: chatId,
      replyTo: null,
      editingMessage: null,
      messages,
      chats: chatId
        ? state.chats.map((c) => c.id === chatId ? { ...c, unreadCount: 0 } : c)
        : state.chats,
    };
  }),

  saveScrollPosition: (chatId, scrollTop) => set((state) => ({
    scrollPositions: { ...state.scrollPositions, [chatId]: scrollTop },
  })),
  setSearchQuery: (query) => set({ searchQuery: query }),

  setDraft: (chatId, text) => {
    set((state) => {
      const drafts = { ...state.drafts };
      if (text.trim()) {
        drafts[chatId] = text;
      } else {
        delete drafts[chatId];
      }
      localStorage.setItem('vortex_drafts', JSON.stringify(drafts));
      return { drafts };
    });
  },

  getDraft: (chatId) => {
    return get().drafts[chatId] || '';
  },

  loadChats: async () => {
    try {
      set({ isLoadingChats: true });
      const chats = await api.getChats();
      // Auto-create favorites chat if not present
      if (!chats.some((c: any) => c.type === 'favorites')) {
        try {
          const favChat = await api.getOrCreateFavorites();
          chats.unshift(favChat);
        } catch {}
      }
      // Extract pinned messages from chats
      const pinnedMessages: Record<string, Message> = {};
      for (const chat of chats) {
        if (chat.pinnedMessages && chat.pinnedMessages.length > 0) {
          pinnedMessages[chat.id] = chat.pinnedMessages[0].message;
        }
      }
      set({ chats, pinnedMessages, isLoadingChats: false });
    } catch (error) {
      console.error('Load chats error:', error);
      set({ isLoadingChats: false });
    }
  },

  loadMessages: async (chatId) => {
    try {
      const existing = get().messages[chatId] || [];
      const isCached = existing.length > 0;

      // Always show skeleton briefly for Telegram-like feel
      set({ isLoadingMessages: true });

      if (isCached) {
        // Brief skeleton flash for cached chats (150ms)
        await new Promise((r) => setTimeout(r, 150));
      }

      const fetched = await api.getMessages(chatId, undefined, 30);
      const hasMore = fetched.length >= 30;

      set((state) => {
        const cur = state.messages[chatId] || [];
        const fetchedIds = new Set(fetched.map(m => m.id));
        const socketOnly = cur.filter(m => !fetchedIds.has(m.id));
        const merged = [...fetched, ...socketOnly].sort(
          (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
        );
        return {
          messages: { ...state.messages, [chatId]: merged },
          hasMore: { ...state.hasMore, [chatId]: hasMore },
          isLoadingMessages: false,
        };
      });
    } catch (error) {
      console.error('Load messages error:', error);
      set({ isLoadingMessages: false });
    }
  },

  loadMoreMessages: async (chatId) => {
    const state = get();
    if (state.isLoadingMore || !state.hasMore[chatId]) return;

    const chatMessages = state.messages[chatId] || [];
    if (chatMessages.length === 0) return;

    const oldestMessage = chatMessages[0];
    const cursor = oldestMessage.id; // Используем ID, а не дату — нет дублей

    try {
      set({ isLoadingMore: true });
      const fetched = await api.getMessages(chatId, cursor, 30);
      const hasMore = fetched.length >= 30;

      if (fetched.length === 0) {
        set({ isLoadingMore: false, hasMore: { ...get().hasMore, [chatId]: false } });
        return;
      }

      set((state) => {
        const existing = state.messages[chatId] || [];
        const fetchedIds = new Set(fetched.map(m => m.id));
        const newOnly = fetched.filter(m => !existing.some(em => em.id === m.id));
        const merged = [...newOnly, ...existing].sort(
          (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
        );
        return {
          messages: { ...state.messages, [chatId]: merged },
          hasMore: { ...state.hasMore, [chatId]: hasMore },
          isLoadingMore: false,
        };
      });
    } catch (error) {
      console.error('Load more messages error:', error);
      set({ isLoadingMore: false });
    }
  },

  addMessage: (message) => {
    set((state) => {
      const chatMessages = state.messages[message.chatId] || [];
      if (chatMessages.some((m) => m.id === message.id)) return state;

      // For non-active chats, keep only the last MAX_MESSAGES_PER_CHAT messages
      let updatedChatMessages: Message[];
      if (message.chatId !== state.activeChat && chatMessages.length >= MAX_MESSAGES_PER_CHAT) {
        updatedChatMessages = [...chatMessages.slice(-(MAX_MESSAGES_PER_CHAT - 1)), message];
      } else {
        updatedChatMessages = [...chatMessages, message];
      }

      const updatedMessages = {
        ...state.messages,
        [message.chatId]: updatedChatMessages,
      };

      // Only update the affected chat — no sort of all chats
      const chatIndex = state.chats.findIndex(c => c.id === message.chatId);
      if (chatIndex === -1) return { messages: updatedMessages };

      const chat = state.chats[chatIndex];
      const updatedChat = {
        ...chat,
        messages: [message],
        unreadCount: chat.id === state.activeChat ? chat.unreadCount : chat.unreadCount + 1,
      };

      // Move affected chat to top if it's not already there
      const newChats = chatIndex === 0
        ? state.chats.map(c => c.id === message.chatId ? updatedChat : c)
        : [updatedChat, ...state.chats.filter(c => c.id !== message.chatId)];

      return { messages: updatedMessages, chats: newChats };
    });
  },

  /** Добавляет «локальное» сообщение, чтобы UI отреагировал мгновенно */
  addOptimisticMessage: (message) => {
    set((state) => {
      const chatMessages = state.messages[message.chatId] || [];
      // Защита от дублей (тот же clientId)
      if (message.clientId && chatMessages.some((m) => m.clientId === message.clientId)) {
        return state;
      }
      // For non-active chats, keep only the last MAX_MESSAGES_PER_CHAT messages
      let updatedChatMessages: Message[];
      if (message.chatId !== state.activeChat && chatMessages.length >= MAX_MESSAGES_PER_CHAT) {
        updatedChatMessages = [...chatMessages.slice(-(MAX_MESSAGES_PER_CHAT - 1)), { ...message, pending: true }];
      } else {
        updatedChatMessages = [...chatMessages, { ...message, pending: true }];
      }

      const updatedMessages = {
        ...state.messages,
        [message.chatId]: updatedChatMessages,
      };

      const chatIndex = state.chats.findIndex(c => c.id === message.chatId);
      if (chatIndex === -1) return { messages: updatedMessages };

      const chat = state.chats[chatIndex];
      const updatedChat = {
        ...chat,
        messages: [message],
        unreadCount: chat.id === state.activeChat ? chat.unreadCount : chat.unreadCount,
      };
      const newChats = chatIndex === 0
        ? state.chats.map(c => c.id === message.chatId ? updatedChat : c)
        : [updatedChat, ...state.chats.filter(c => c.id !== message.chatId)];

      return { messages: updatedMessages, chats: newChats };
    });
  },

  /** Подтверждение сервером: заменяем pending на реальное сообщение */
  confirmMessage: (clientId, realMessage) => {
    set((state) => {
      const chatMessages = state.messages[realMessage.chatId] || [];
      // Если уже пришло реальное — игнорируем
      if (chatMessages.some((m) => m.id === realMessage.id)) return state;

      const foundOptimistic = chatMessages.some((m) => m.clientId === clientId);

      if (foundOptimistic) {
        // Replace optimistic with real message
        const updatedMessages = {
          ...state.messages,
          [realMessage.chatId]: chatMessages.map((m) =>
            m.clientId === clientId ? { ...realMessage, pending: false, clientId } : m
          ),
        };
        return { messages: updatedMessages };
      }

      // No optimistic message found (e.g. media messages) — add the real message directly
      const updatedChatMessages = [...chatMessages, { ...realMessage, pending: false }];
      const updatedMessages = {
        ...state.messages,
        [realMessage.chatId]: updatedChatMessages,
      };

      // Move chat to top of sidebar
      const chatIndex = state.chats.findIndex(c => c.id === realMessage.chatId);
      if (chatIndex === -1) return { messages: updatedMessages };
      const chat = state.chats[chatIndex];
      const updatedChat = { ...chat, messages: [realMessage] };
      const newChats = chatIndex === 0
        ? state.chats.map(c => c.id === realMessage.chatId ? updatedChat : c)
        : [updatedChat, ...state.chats.filter(c => c.id !== realMessage.chatId)];

      return { messages: updatedMessages, chats: newChats };
    });
  },

  /** Помечает сообщение как не доставленное (например, content warning) */
  failOptimisticMessage: (clientId) => {
    set((state) => {
      const updatedMessages: Record<string, Message[]> = { ...state.messages };
      for (const chatId of Object.keys(updatedMessages)) {
        updatedMessages[chatId] = updatedMessages[chatId].map((m) =>
          m.clientId === clientId ? { ...m, pending: false, failed: true } : m
        );
      }
      return { messages: updatedMessages };
    });
  },

  /** Повторная отправка: ставим pending=true и убираем failed */
  retryMessage: (clientId) => {
    set((state) => {
      const updatedMessages: Record<string, Message[]> = { ...state.messages };
      for (const chatId of Object.keys(updatedMessages)) {
        updatedMessages[chatId] = updatedMessages[chatId].map((m) =>
          m.clientId === clientId ? { ...m, pending: true, failed: false } : m
        );
      }
      return { messages: updatedMessages };
    });
  },

  /** Все pending-сообщения для повторной отправки при реконнекте */
  getPendingMessages: () => {
    const state = get();
    const pending: Message[] = [];
    for (const chatId of Object.keys(state.messages)) {
      for (const msg of state.messages[chatId]) {
        if (msg.pending && msg.clientId) {
          pending.push(msg);
        }
      }
    }
    return pending;
  },

  updateMessage: (message) => {
    set((state) => {
      const chatMessages = state.messages[message.chatId] || [];
      return {
        messages: {
          ...state.messages,
          [message.chatId]: chatMessages.map((m) => (m.id === message.id ? message : m)),
        },
      };
    });
  },

  removeMessage: (messageId, chatId) => {
    set((state) => {
      const chatMessages = state.messages[chatId] || [];
      const updatedMessages = chatMessages.map((m) =>
        m.id === messageId ? { ...m, isDeleted: true, content: null } : m
      );

      // Find the latest non-deleted message to show in sidebar
      const latestVisible = updatedMessages
        .filter(m => !m.isDeleted)
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0];

      const updatedChats = state.chats.map((chat) => {
        if (chat.id === chatId) {
          // If the deleted message was the last message shown, replace with previous one
          const currentLast = chat.messages?.[0];
          if (currentLast?.id === messageId) {
            return {
              ...chat,
              messages: latestVisible ? [latestVisible] : [{ ...currentLast, isDeleted: true, content: null }],
            };
          }
        }
        return chat;
      });

      return {
        messages: {
          ...state.messages,
          [chatId]: updatedMessages,
        },
        chats: updatedChats,
      };
    });
  },

  removeMessages: (messageIds, chatId) => {
    const idsSet = new Set(messageIds);
    set((state) => {
      const chatMessages = state.messages[chatId] || [];
      const updatedMessages = chatMessages.map((m) =>
        idsSet.has(m.id) ? { ...m, isDeleted: true, content: null } : m
      );

      const latestVisible = updatedMessages
        .filter(m => !m.isDeleted)
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0];

      const updatedChats = state.chats.map((chat) => {
        if (chat.id === chatId) {
          const currentLast = chat.messages?.[0];
          if (currentLast && idsSet.has(currentLast.id)) {
            return {
              ...chat,
              messages: latestVisible ? [latestVisible] : [{ ...currentLast, isDeleted: true, content: null }],
            };
          }
        }
        return chat;
      });

      return {
        messages: { ...state.messages, [chatId]: updatedMessages },
        chats: updatedChats,
      };
    });
  },

  hideMessages: (messageIds, chatId) => {
    const idsSet = new Set(messageIds);
    set((state) => {
      const chatMessages = state.messages[chatId] || [];
      const updatedMessages = chatMessages.filter((m) => !idsSet.has(m.id));

      const latestVisible = updatedMessages
        .filter(m => !m.isDeleted)
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0];

      const updatedChats = state.chats.map((chat) => {
        if (chat.id === chatId) {
          const currentLast = chat.messages?.[0];
          if (currentLast && idsSet.has(currentLast.id)) {
            return {
              ...chat,
              messages: latestVisible ? [latestVisible] : [],
            };
          }
        }
        return chat;
      });

      return {
        messages: { ...state.messages, [chatId]: updatedMessages },
        chats: updatedChats,
      };
    });
  },

  addReaction: (messageId, chatId, userId, username, emoji) => {
    set((state) => {
      const chatMessages = state.messages[chatId] || [];
      return {
        messages: {
          ...state.messages,
          [chatId]: chatMessages.map((m) => {
            if (m.id === messageId) {
              const exists = m.reactions.some((r) => r.userId === userId && r.emoji === emoji);
              if (exists) return m;
              return {
                ...m,
                reactions: [
                  ...m.reactions,
                  { id: `${messageId}-${userId}-${emoji}`, emoji, userId, user: { id: userId, username, displayName: username } },
                ],
              };
            }
            return m;
          }),
        },
      };
    });
  },

  removeReaction: (messageId, chatId, userId, emoji) => {
    set((state) => {
      const chatMessages = state.messages[chatId] || [];
      return {
        messages: {
          ...state.messages,
          [chatId]: chatMessages.map((m) => {
            if (m.id === messageId) {
              return {
                ...m,
                reactions: m.reactions.filter((r) => !(r.userId === userId && r.emoji === emoji)),
              };
            }
            return m;
          }),
        },
      };
    });
  },

  markRead: (chatId, userId, messageIds) => {
    const currentUserId = useAuthStore.getState().user?.id;
    set((state) => {
      const chatMessages = state.messages[chatId] || [];
      return {
        messages: {
          ...state.messages,
          [chatId]: chatMessages.map((m) => {
            if (messageIds.includes(m.id)) {
              const alreadyRead = m.readBy?.some((r) => r.userId === userId);
              if (alreadyRead) return m;
              return { ...m, readBy: [...(m.readBy || []), { userId }] };
            }
            return m;
          }),
        },
        chats: state.chats.map((chat) => {
          if (chat.id === chatId && userId === currentUserId) {
            return { ...chat, unreadCount: 0 };
          }
          return chat;
        }),
      };
    });
  },

  addTypingUser: (chatId, userId) => {
    set((state) => {
      const exists = state.typingUsers.some((t) => t.chatId === chatId && t.userId === userId);
      if (exists) return state;
      return { typingUsers: [...state.typingUsers, { chatId, userId }] };
    });
  },

  removeTypingUser: (chatId, userId) => {
    set((state) => ({
      typingUsers: state.typingUsers.filter((t) => !(t.chatId === chatId && t.userId === userId)),
    }));
  },

  updateUserOnlineStatus: (userId, isOnline, lastSeen) => {
    set((state) => {
      const newChats = state.chats.map((chat) => {
        const hasUser = chat.members.some(m => m.user.id === userId);
        if (!hasUser) return chat;
        return {
          ...chat,
          members: chat.members.map((m) =>
            m.user.id === userId
              ? { ...m, user: { ...m.user, isOnline, lastSeen: lastSeen || m.user.lastSeen } }
              : m
          ),
        };
      });
      return { chats: newChats };
    });
  },

  setReplyTo: (message) => set({ replyTo: message, editingMessage: null }),
  setEditingMessage: (message) => set({ editingMessage: message, replyTo: null }),

  addChat: (chat) => {
    set((state) => {
      if (state.chats.some((c) => c.id === chat.id)) return state;
      return { chats: [chat, ...state.chats] };
    });
  },

  updateChat: (chat) => {
    set((state) => ({
      chats: state.chats.map((c) => (c.id === chat.id ? { ...c, ...chat } : c)),
    }));
  },

  removeChat: (chatId) => {
    set((state) => {
      // Очищаем черновик из localStorage
      const drafts = { ...state.drafts };
      delete drafts[chatId];
      localStorage.setItem('vortex_drafts', JSON.stringify(drafts));

      // Очищаем позицию скролла
      const scrollPositions = { ...state.scrollPositions };
      delete scrollPositions[chatId];

      const messages = { ...state.messages };
      delete messages[chatId];

      return {
        chats: state.chats.filter((c) => c.id !== chatId),
        activeChat: state.activeChat === chatId ? null : state.activeChat,
        messages,
        drafts,
        scrollPositions,
      };
    });
  },

  clearMessages: (chatId) => {
    set((state) => ({
      messages: { ...state.messages, [chatId]: [] },
      chats: state.chats.map((c) =>
        c.id === chatId ? { ...c, messages: [] } : c
      ),
    }));
  },

  setPinnedMessage: (chatId, message) => {
    set((state) => ({
      pinnedMessages: { ...state.pinnedMessages, [chatId]: message },
    }));
  },

  removePinnedMessage: (chatId, _messageId, newPinned) => {
    set((state) => {
      const updated = { ...state.pinnedMessages };
      if (newPinned) {
        updated[chatId] = newPinned;
      } else {
        delete updated[chatId];
      }
      return { pinnedMessages: updated };
    });
  },

  clearStore: () => {
    set({
      chats: [],
      activeChat: null,
      messages: {},
      pinnedMessages: {},
      typingUsers: [],
      replyTo: null,
      editingMessage: null,
      hasMore: {},
      isLoadingMore: false,
      isLoadingMessages: false,
      isLoadingChats: false,
      searchQuery: '',
    });
  },
}));
