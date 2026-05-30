import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useChatStore } from '../stores/chatStore';
import { useAuthStore } from '../stores/authStore';
import { useThemeStore } from '../stores/themeStore';
import { getSocket, disconnectSocket } from '../lib/socket';
import { api } from '../lib/api';
import { playNotificationSound, isChatMuted } from '../lib/sounds';
import { useLang } from '../lib/i18n';
import type { Message, UserBasic, CallInfo } from '../lib/types';
import { Send, Check } from 'lucide-react';
import Sidebar from '../components/Sidebar';
import ChatView from '../components/ChatView';
import CallModal from '../components/CallModal';
import GroupCallModal from '../components/GroupCallModal';

export default function ChatPage() {
  const {
    loadChats,
    addMessage,
    updateMessage,
    removeMessage,
    removeMessages,
    hideMessages,
    addReaction,
    removeReaction,
    markRead,
    addTypingUser,
    removeTypingUser,
    updateUserOnlineStatus,
    setPinnedMessage,
    removePinnedMessage,
    clearStore,
    activeChat,
  } = useChatStore();
  const { user } = useAuthStore();
  const { chatTheme } = useThemeStore();
  const initialized = useRef(false);
  const [isMobile, setIsMobile] = useState(false);

  // Detect mobile
  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth <= 768);
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // Call state
  const [callOpen, setCallOpen] = useState(false);
  const [callTarget, setCallTarget] = useState<UserBasic | null>(null);
  const [callType, setCallType] = useState<'voice' | 'video'>('voice');
  const [incomingCall, setIncomingCall] = useState<CallInfo | null>(null);
  const [callSessionId, setCallSessionId] = useState(0);
  const [deliveryNotification, setDeliveryNotification] = useState<string | null>(null);
  const deliveryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Group call state
  const [groupCallOpen, setGroupCallOpen] = useState(false);
  const [groupCallChatId, setGroupCallChatId] = useState('');
  const [groupCallChatName, setGroupCallChatName] = useState('');
  const [groupCallType, setGroupCallType] = useState<'voice' | 'video'>('voice');
  const [groupCallSessionId, setGroupCallSessionId] = useState(0);

  const [showWarningModal, setShowWarningModal] = useState(false);
  const [warningMessage, setWarningMessage] = useState('');
  const [warningWord, setWarningWord] = useState('');
  const [warningTimestamp, setWarningTimestamp] = useState('');

  const { t } = useLang();

  // Mouse tracking for animated themes
  useEffect(() => {
    const animatedThemes = ['neon', 'aurora', 'cyber', 'glass', 'void'];
    if (!animatedThemes.includes(chatTheme)) return;

    const handleMouseMove = (e: MouseEvent) => {
      const chatView = document.querySelector(`[class*="chat-theme-${chatTheme}"]`) as HTMLElement;
      if (chatView) {
        const rect = chatView.getBoundingClientRect();
        chatView.style.setProperty('--mouse-x', `${e.clientX - rect.left}px`);
        chatView.style.setProperty('--mouse-y', `${e.clientY - rect.top}px`);
      }
    };

    window.addEventListener('mousemove', handleMouseMove);
    return () => window.removeEventListener('mousemove', handleMouseMove);
  }, [chatTheme]);

  // Removed block status check - users are no longer blocked

  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;
    loadChats();
  }, [loadChats]);

  // Обработка закрытия вкладки — отправить disconnect
  useEffect(() => {
    const handleBeforeUnload = () => {
      const socket = getSocket();
      if (socket) {
        socket.disconnect();
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, []);

  useEffect(() => {
    const socket = getSocket();
    if (!socket) return;

    socket.on('new_message', async (message: Message) => {
      // If this chat isn't in our store yet (e.g. someone just created it and sent a message),
      // fetch chats so the new chat appears in the sidebar immediately
      const { chats } = useChatStore.getState();
      if (!chats.some(c => c.id === message.chatId)) {
        try {
          const allChats = await api.getChats();
          const newChat = allChats.find(c => c.id === message.chatId);
          if (newChat) {
            // Reset unreadCount to 0 because addMessage below will increment it by 1
            useChatStore.getState().addChat({ ...newChat, unreadCount: 0 });
          }
        } catch (e) {
          console.error('Failed to fetch new chat:', e);
        }
      }
      addMessage(message);
      // Play notification sound for messages from others
      if (message.senderId !== user?.id && !isChatMuted(message.chatId)) {
        playNotificationSound();
      }
    });

    socket.on('scheduled_delivered', async (message: Message & { _recipientName?: string; _deliveredAt?: string }) => {
      // If chat unknown, fetch it first
      const { chats } = useChatStore.getState();
      if (!chats.some(c => c.id === message.chatId)) {
        try {
          const allChats = await api.getChats();
          const newChat = allChats.find(c => c.id === message.chatId);
          if (newChat) useChatStore.getState().addChat(newChat);
        } catch (_) { /* ignore */ }
      }
      // A scheduled message was delivered: update it in store (remove scheduledAt)
      updateMessage({ ...message, scheduledAt: null });

      // Show delivery notification to the sender
      if (message.senderId === user?.id && message._recipientName) {
        const time = message._deliveredAt
          ? new Date(message._deliveredAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
          : '';
        const notifText = `${useLang.getState().t('scheduledDelivered')} ${message._recipientName} ${useLang.getState().t('scheduledDeliveredAt')} ${time}`;
        setDeliveryNotification(notifText);
        if (deliveryTimerRef.current) clearTimeout(deliveryTimerRef.current);
        deliveryTimerRef.current = setTimeout(() => setDeliveryNotification(null), 5000);
      }

      // Notify others with sound
      if (message.senderId !== user?.id && !isChatMuted(message.chatId)) {
        playNotificationSound();
      }
    });

    socket.on('message_edited', (message: Message) => {
      updateMessage(message);
    });

    socket.on('message_deleted', (data: { messageId: string; chatId: string }) => {
      removeMessage(data.messageId, data.chatId);
    });

    socket.on('messages_deleted', (data: { messageIds: string[]; chatId: string }) => {
      removeMessages(data.messageIds, data.chatId);
    });

    socket.on('messages_hidden', (data: { messageIds: string[]; chatId: string }) => {
      hideMessages(data.messageIds, data.chatId);
    });

    socket.on('reaction_added', (data: { messageId: string; chatId: string; userId: string; username: string; emoji: string }) => {
      addReaction(data.messageId, data.chatId, data.userId, data.username, data.emoji);
    });

    socket.on('reaction_removed', (data: { messageId: string; chatId: string; userId: string; emoji: string }) => {
      removeReaction(data.messageId, data.chatId, data.userId, data.emoji);
    });

    socket.on('messages_read', (data: { chatId: string; userId: string; messageIds: string[] }) => {
      markRead(data.chatId, data.userId, data.messageIds);
    });

    socket.on('user_typing', (data: { chatId: string; userId: string }) => {
      if (data.userId !== user?.id) {
        addTypingUser(data.chatId, data.userId);
        setTimeout(() => removeTypingUser(data.chatId, data.userId), 3000);
      }
    });

    socket.on('user_stopped_typing', (data: { chatId: string; userId: string }) => {
      removeTypingUser(data.chatId, data.userId);
    });

    socket.on('user_online', (data: { userId: string }) => {
      updateUserOnlineStatus(data.userId, true);
    });

    socket.on('user_offline', (data: { userId: string; lastSeen?: string }) => {
      updateUserOnlineStatus(data.userId, false, data.lastSeen);
    });

    socket.on('message_pinned', (data: { chatId: string; message: Message }) => {
      setPinnedMessage(data.chatId, data.message);
    });

    socket.on('message_unpinned', (data: { chatId: string; messageId: string; newPinnedMessage: Message | null }) => {
      removePinnedMessage(data.chatId, data.messageId, data.newPinnedMessage);
    });

    socket.on('chat_deleted_by_other', (data: { chatId: string; deletedBy: string; forUser: string }) => {
      console.log('chat_deleted_by_other received:', data);
      if (data.forUser === user?.id) {
        useChatStore.getState().removeChat(data.chatId);
        // If the deleted chat is currently active, close it
        if (useChatStore.getState().activeChat === data.chatId) {
          useChatStore.getState().setActiveChat(null);
        }
      }
    });

    socket.on('call_incoming', async (data: CallInfo) => {
      // Use callerInfo from server if available, otherwise look up from chats
      let callerInfo: UserBasic | null = data.callerInfo || null;
      if (!callerInfo) {
        const { chats } = useChatStore.getState();
        for (const chat of chats) {
          const member = chat.members.find((m) => m.user.id === data.from);
          if (member) {
            callerInfo = member.user;
            break;
          }
        }
      }
      setCallTarget(null); // Clear any previous outgoing target
      setIncomingCall({
        from: data.from,
        offer: data.offer,
        callType: data.callType,
        chatId: data.chatId,
        callerInfo,
      });
      setCallType(data.callType);
      setCallSessionId(id => id + 1);
      setCallOpen(true);
    });

    socket.on('content_warning', (data: { message: string; word: string; timestamp: string }) => {
      console.log('Received content_warning event:', data);
      setWarningMessage(data.message);
      setWarningWord(data.word);
      setWarningTimestamp(data.timestamp);
      setShowWarningModal(true);
      // Auto-hide after 5 seconds
      setTimeout(() => setShowWarningModal(false), 5000);
    });

    return () => {
      socket.off('new_message');
      socket.off('scheduled_delivered');
      socket.off('message_edited');
      socket.off('message_deleted');
      socket.off('messages_deleted');
      socket.off('messages_hidden');
      socket.off('reaction_added');
      socket.off('reaction_removed');
      socket.off('messages_read');
      socket.off('user_typing');
      socket.off('user_stopped_typing');
      socket.off('user_online');
      socket.off('user_offline');
      socket.off('message_pinned');
      socket.off('message_unpinned');
      socket.off('chat_deleted_by_other');
      socket.off('call_incoming');
      socket.off('content_warning');
    };
  }, [user?.id]);

  const handleStartCall = (targetUser: UserBasic, type: 'voice' | 'video') => {
    setCallTarget(targetUser);
    setCallType(type);
    setIncomingCall(null);
    setCallSessionId(id => id + 1);
    setCallOpen(true);
  };

  const handleStartGroupCall = (chatId: string, chatName: string, type: 'voice' | 'video') => {
    setGroupCallChatId(chatId);
    setGroupCallChatName(chatName);
    setGroupCallType(type);
    setGroupCallSessionId(id => id + 1);
    setGroupCallOpen(true);
  };

  const handleCloseCall = () => {
    setCallOpen(false);
    setCallTarget(null);
    setIncomingCall(null);
  };

  const handleCloseGroupCall = () => {
    setGroupCallOpen(false);
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="h-full flex flex-col md:flex-row bg-surface overflow-hidden relative"
      style={{ padding: 'env(safe-area-inset-top) 0 0 0', paddingLeft: 'max(env(safe-area-inset-left), 0px)', paddingRight: 'max(env(safe-area-inset-right), 0px)' }}
    >
      <div className="flex-1 flex relative w-full h-full">
        <Sidebar />
        <ChatView onStartCall={handleStartCall} onStartGroupCall={handleStartGroupCall} />
      </div>
      <CallModal
        key={callSessionId}
        isOpen={callOpen}
        onClose={handleCloseCall}
        targetUser={callTarget}
        callType={callType}
        incoming={incomingCall}
      />
      <GroupCallModal
        key={`gc-${groupCallSessionId}`}
        isOpen={groupCallOpen}
        onClose={handleCloseGroupCall}
        chatId={groupCallChatId}
        chatName={groupCallChatName}
        callType={groupCallType}
      />

      {/* Scheduled message delivery notification */}
      <AnimatePresence>
        {deliveryNotification && (
          <motion.div
            initial={{ opacity: 0, y: -20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -20, scale: 0.95 }}
            className="fixed top-6 left-1/2 -translate-x-1/2 z-[9999] px-5 py-3 rounded-2xl bg-surface-secondary shadow-2xl border border-border flex items-center gap-3"
          >
            <div className="w-8 h-8 rounded-full bg-emerald-500/20 flex items-center justify-center flex-shrink-0">
              <Send size={14} className="text-emerald-400" />
            </div>
            <span className="text-sm text-zinc-200">{deliveryNotification}</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Content warning notification */}
      <AnimatePresence>
        {showWarningModal && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[10000]"
              onClick={() => setShowWarningModal(false)}
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              transition={{ duration: 0.3, ease: [0.4, 0, 0.2, 1] }}
              className="fixed inset-0 z-[10001] flex items-center justify-center p-4 pointer-events-none"
            >
              <div className="bg-surface-secondary border border-border rounded-3xl shadow-2xl p-8 max-w-md w-full pointer-events-auto">
                {/* Warning icon */}
                <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-yellow-500/10 flex items-center justify-center">
                  <svg className="w-10 h-10 text-yellow-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                </div>

                {/* Title */}
                <h2 className="text-xl font-bold text-yellow-500 mb-3 text-center">
                  Запрещённый контент
                </h2>

                {/* Message */}
                <p className="text-zinc-300 text-center mb-4">
                  {warningMessage}
                </p>

                {/* Details */}
                <div className="bg-surface-tertiary/50 border border-border rounded-xl p-4 mb-4">
                  <div className="flex flex-col gap-1">
                    <p className="text-xs text-zinc-500 uppercase tracking-wide">Обнаруженное слово</p>
                    <p className="text-yellow-400 font-mono text-sm font-semibold">"{warningWord}"</p>
                  </div>
                </div>

                {/* Close button */}
                <button
                  onClick={() => setShowWarningModal(false)}
                  className="w-full px-6 py-3 bg-yellow-500 hover:bg-yellow-600 text-black font-semibold rounded-xl transition-colors"
                >
                  Понятно
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
