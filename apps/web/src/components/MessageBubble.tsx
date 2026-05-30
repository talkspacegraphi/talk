import { useState, useRef, useEffect, memo, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Check,
  CheckCheck,
  Play,
  Pause,
  Download,
  FileText,
  Copy,
  Pencil,
  Trash2,
  Reply,
  Smile,
  MoreHorizontal,
  X,
  Volume2,
  Pin,
  Clock,
  Star,
  ExternalLink,
  Music,
} from 'lucide-react';
import { useAuthStore } from '../stores/authStore';
import { useChatStore } from '../stores/chatStore';
import { getSocket } from '../lib/socket';
import { useLang } from '../lib/i18n';
import { extractWaveform } from '../lib/utils';
import { api } from '../lib/api';
import type { Message, MediaItem, Reaction, ChatMember } from '../lib/types';
import MediaGrid from './MediaGrid';
import AnimatedEmoji from './AnimatedEmoji';

interface MessageBubbleProps {
  message: Message;
  isMine: boolean;
  showAvatar: boolean;
  onViewProfile?: (userId: string) => void;
  selectionMode?: boolean;
  isSelected?: boolean;
  onToggleSelect?: (id: string) => void;
  onStartSelectionMode?: (id: string) => void;
}

function MessageBubble({
  message,
  isMine,
  showAvatar,
  onViewProfile,
  selectionMode,
  isSelected,
  onToggleSelect,
  onStartSelectionMode
}: MessageBubbleProps) {
  const { user } = useAuthStore();
  const { setReplyTo, setEditingMessage } = useChatStore();
  const { t, lang } = useLang();

  // Memoized values to avoid re-computation on every render
  const pinnedMessages = useChatStore(s => s.pinnedMessages);
  const chats = useChatStore(s => s.chats);

  const [showContext, setShowContext] = useState(false);
  const [contextPos, setContextPos] = useState({ x: 0, y: 0 });
  const [deleteMenuMode, setDeleteMenuMode] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [audioProgress, setAudioProgress] = useState(0);
  const [audioDuration, setAudioDuration] = useState(0);
  const [waveformBars, setWaveformBars] = useState<number[] | null>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const bubbleRef = useRef<HTMLDivElement>(null);
  const [quotedText, setQuotedText] = useState<string | null>(null);
  const [favoriteGifs, setFavoriteGifs] = useState<string[]>(() => {
    try {
      const stored = localStorage.getItem('vortex_favorite_gifs');
      return stored ? JSON.parse(stored) : [];
    } catch { return []; }
  });
  const [swipeX, setSwipeX] = useState(0);
  const [isSwiping, setIsSwiping] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [youtubePreview, setYoutubePreview] = useState<{ videoId: string; title?: string; author?: string } | null>(null);
  const [showLinkModal, setShowLinkModal] = useState(false);
  const [pendingLink, setPendingLink] = useState<string | null>(null);
  const [longPressTimer, setLongPressTimer] = useState<NodeJS.Timeout | null>(null);
  const [touchStartPos, setTouchStartPos] = useState<{ x: number; y: number } | null>(null);
  const [show67Modal, setShow67Modal] = useState(false);
  const audioRef67 = useRef<HTMLAudioElement>(null);
  // Audio player states
  const [audioVolume, setAudioVolume] = useState(() => {
    const stored = localStorage.getItem('vortex_audio_volume');
    return stored ? parseFloat(stored) : 0.7;
  });
  const [showVolumeSlider, setShowVolumeSlider] = useState(false);
  const [isDraggingProgress, setIsDraggingProgress] = useState(false);
  const [hoverTime, setHoverTime] = useState<number | null>(null);
  // Volume drag state
  const [isDraggingVolume, setIsDraggingVolume] = useState(false);
  const volumeSliderRef = useRef<HTMLDivElement>(null);

  // Check if message is exactly "67" for special animation
  const is67Message = message.content?.trim() === '67' && !message.media?.length;

  const close67Modal = () => {
    setShow67Modal(false);
    if (audioRef67.current) {
      audioRef67.current.pause();
      audioRef67.current.currentTime = 0;
    }
  };

  const open67Modal = () => {
    setShow67Modal(true);
    // Play audio with user interaction
    setTimeout(() => {
      if (audioRef67.current) {
        audioRef67.current.play().catch((err) => {
          console.log('Audio play failed:', err);
        });
      }
    }, 100);
  };

  // Detect mobile device
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth <= 768 || 'ontouchstart' in window);
    };
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // Extract YouTube video ID from message - DISABLED to prevent loading issues
  // useEffect(() => {
  //   if (!message.content || message.isDeleted) return;
  //   const youtubeRegex = /(?:youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/;
  //   const match = message.content.match(youtubeRegex);
  //   if (match) {
  //     const videoId = match[1];
  //     setYoutubePreview({ videoId });
  //   }
  // }, [message.content, message.isDeleted]);

  // Reset swipeX when not swiping
  useEffect(() => {
    if (!isSwiping) {
      const timer = setTimeout(() => setSwipeX(0), 300);
      return () => clearTimeout(timer);
    }
  }, [isSwiping]);

  const toggleGifFavorite = (gifUrl: string) => {
    try {
      const stored = localStorage.getItem('vortex_favorite_gifs');
      const favorites = stored ? JSON.parse(stored) : [];
      const index = favorites.findIndex((f: any) => f.url === gifUrl);

      if (index >= 0) {
        favorites.splice(index, 1);
      } else {
        favorites.unshift({
          id: Date.now().toString(),
          url: gifUrl,
          preview: gifUrl,
          title: 'Saved GIF',
        });
      }

      localStorage.setItem('vortex_favorite_gifs', JSON.stringify(favorites));
      setFavoriteGifs(favorites.map((f: any) => f.url));
    } catch (err) {
      console.error('Failed to toggle gif favorite:', err);
    }
  };

  const isGifFavorite = (url: string) => favoriteGifs.includes(url);

  // Прочитано
  const isRead = message.readBy?.some((r) => r.userId !== user?.id);

  const timeStr = new Date(message.createdAt).toLocaleTimeString(lang === 'ru' ? 'ru-RU' : 'en-US', {
    hour: '2-digit',
    minute: '2-digit',
  });

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation(); // Avoid triggering window listener instantly for other menus
    if (selectionMode) {
      onToggleSelect?.(message.id);
      return;
    }
    const rect = bubbleRef.current?.getBoundingClientRect();
    if (!rect) return;

    // Check if text is selected inside this bubble
    const selection = window.getSelection();
    const text = selection?.toString().trim();
    if (text && bubbleRef.current?.contains(selection?.anchorNode || null)) {
      setQuotedText(text);
    } else {
      setQuotedText(null);
    }

    const menuWidth = 208;
    const menuHeight = 350; // estimate
    let x = e.clientX;
    let y = e.clientY;

    if (x + menuWidth > window.innerWidth) x = window.innerWidth - menuWidth - 8;
    if (y + menuHeight > window.innerHeight) y = window.innerHeight - menuHeight - 8;

    setContextPos({ x, y });
    setShowContext(true);
  };

  const handleCopy = () => {
    if (message.content) {
      navigator.clipboard.writeText(message.content);
    }
    setShowContext(false);
  };

  const handleReply = () => {
    setReplyTo({ ...message, quote: quotedText });
    setShowContext(false);
    setQuotedText(null);
  };

  const handleEdit = () => {
    setEditingMessage(message);
    setShowContext(false);
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
    setShowContext(false);
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
    // Optimistic hide
    useChatStore.getState().hideMessages([message.id], message.chatId);
    setShowContext(false);
    setDeleteMenuMode(false);
  };

  // Memoized derived values
  const isPinned = pinnedMessages[message.chatId]?.id === message.id;

  const chatForDelete = useMemo(() =>
    chats.find(c => c.id === message.chatId), [chats, message.chatId]);

  const otherMemberName = useMemo(() => {
    if (!chatForDelete || chatForDelete.type !== 'personal') return '';
    const other = chatForDelete.members.find(m => m.user.id !== user?.id);
    return other?.user.displayName || other?.user.username || '';
  }, [chatForDelete, user?.id]);

  const handlePin = () => {
    const socket = getSocket();
    if (socket) {
      if (isPinned) {
        socket.emit('unpin_message', { messageId: message.id, chatId: message.chatId });
      } else {
        socket.emit('pin_message', { messageId: message.id, chatId: message.chatId });
      }
    }
    setShowContext(false);
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
    setShowContext(false);
  };

  // Аудио плеер
  const toggleAudio = () => {
    const audio = audioRef.current;
    if (!audio) return;

    if (isPlaying) {
      audio.pause();
      setIsPlaying(false);
    } else {
      // Ensure audio is loaded before playing
      if (audio.readyState < 2) {
        audio.load();
      }
      audio.play().then(() => {
        setIsPlaying(true);
      }).catch((err) => {
        console.error('Audio play error:', err);
        // Try reloading and playing again
        audio.load();
        audio.play().then(() => setIsPlaying(true)).catch(console.error);
      });
    }
  };

  const handleVolumeChange = (vol: number) => {
    const audio = audioRef.current;
    if (audio) {
      audio.volume = vol;
    }
    setAudioVolume(vol);
    localStorage.setItem('vortex_audio_volume', vol.toString());
  };

  const handleSeek = (e: React.MouseEvent<HTMLDivElement> | React.MouseEvent<HTMLSpanElement>, duration: number) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    if (audioRef.current) {
      audioRef.current.currentTime = pct * duration;
      setAudioProgress(pct * 100);
    }
  };

  const handleProgressHover = (e: React.MouseEvent<HTMLDivElement>, duration: number) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    setHoverTime(pct * duration);
  };

  // Volume drag handlers
  useEffect(() => {
    if (!isDraggingVolume) return;

    const handleMouseMove = (e: MouseEvent) => {
      if (!volumeSliderRef.current) return;
      const rect = volumeSliderRef.current.getBoundingClientRect();
      const pct = 1 - Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));
      handleVolumeChange(pct);
    };

    const handleMouseUp = () => {
      setIsDraggingVolume(false);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDraggingVolume]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const onTimeUpdate = () => {
      if (audio.duration) {
        setAudioProgress((audio.currentTime / audio.duration) * 100);
      }
    };

    const onLoadedMetadata = () => {
      setAudioDuration(audio.duration);
      if (audioRef.current) {
        audioRef.current.volume = audioVolume;
      }
    };

    const onEnded = () => {
      setIsPlaying(false);
      setAudioProgress(0);
    };

    audio.addEventListener('timeupdate', onTimeUpdate);
    audio.addEventListener('loadedmetadata', onLoadedMetadata);
    audio.addEventListener('ended', onEnded);

    return () => {
      audio.removeEventListener('timeupdate', onTimeUpdate);
      audio.removeEventListener('loadedmetadata', onLoadedMetadata);
      audio.removeEventListener('ended', onEnded);
    };
  }, []);

  // Extract real waveform from voice audio  
  useEffect(() => {
    const voiceUrl = message.media?.find((m) => m.type === 'voice')?.url;
    if (!voiceUrl) return;
    extractWaveform(voiceUrl, 28).then(setWaveformBars);
  }, [message.media]);

  const formatDuration = (sec: number) => {
    if (!sec || isNaN(sec) || !isFinite(sec)) return '0:00';
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  // Close context menu logic
  const contextMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!showContext) return;
    const hideMenu = (e: MouseEvent) => {
      // Don't close if clicking inside the context menu
      if (contextMenuRef.current?.contains(e.target as Node)) {
        return;
      }
      setShowContext(false);
      setDeleteMenuMode(false);
    };
    window.addEventListener('click', hideMenu, true);
    window.addEventListener('contextmenu', hideMenu, true);
    return () => {
      window.removeEventListener('click', hideMenu, true);
      window.removeEventListener('contextmenu', hideMenu, true);
    };
  }, [showContext]);

  // Deleted message — auto-hide after 5 seconds
  const [deletedVisible, setDeletedVisible] = useState(true);
  useEffect(() => {
    if (message.isDeleted) {
      const timer = setTimeout(() => setDeletedVisible(false), 5000);
      return () => clearTimeout(timer);
    }
  }, [message.isDeleted]);

  if (message.isDeleted) {
    if (!deletedVisible) return null;
    return (
      <motion.div
        initial={{ opacity: 1, height: 'auto' }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0, height: 0 }}
        className={`flex ${isMine ? 'justify-end' : 'justify-start'} mb-1`}
      >
        <div className="px-4 py-2 rounded-2xl text-sm italic text-zinc-600 bg-surface-tertiary/50">
          {t('messageDeleted')}
        </div>
      </motion.div>
    );
  }

  const media = message.media || [];
  const hasImage = media.some((m) => m.type === 'image');
  const hasVoice = message.type === 'voice' || media.some((m) => m.type === 'voice');
  const hasAudio = message.type === 'audio' || media.some((m) => m.type === 'audio');
  const hasFile = media.some((m) => m.type !== 'image' && m.type !== 'voice' && m.type !== 'video' && m.type !== 'audio');
  const hasVideo = media.some((m) => m.type === 'video');

  // Группировка реакций
  const reactionGroups: Record<string, { count: number; users: string[]; isMine: boolean }> = {};
  (message.reactions || []).forEach((r) => {
    if (!reactionGroups[r.emoji]) {
      reactionGroups[r.emoji] = { count: 0, users: [], isMine: false };
    }
    reactionGroups[r.emoji].count++;
    reactionGroups[r.emoji].users.push(r.user?.displayName || r.user?.username || '');
    if (r.userId === user?.id) reactionGroups[r.emoji].isMine = true;
  });

  const senderName = message.sender?.displayName || message.sender?.username || '';
  const senderAvatar = message.sender?.avatar;

  // Simple Markdown formatter
  const renderFormattedText = (text: string) => {
    if (!text) return text;

    // Exclude pure digit strings from emoji-only check
    const isPureDigits = /^\d+$/.test(text.trim());

    // Check if message is only emoji (for large emoji display)
    const emojiOnlyRegex = /^[\p{Emoji}\s]+$/u;
    const isEmojiOnly = emojiOnlyRegex.test(text.trim()) && !isPureDigits;
    const emojiCount = (text.match(/\p{Emoji}/gu) || []).length;

    // If it's only emojis (1-3), render them at a normal size
    if (isEmojiOnly && emojiCount <= 3) {
      const emojis = text.match(/\p{Emoji}/gu) || [];
      return (
        <span className="flex gap-1">
          {emojis.map((emoji, i) => (
            <AnimatedEmoji key={i} emoji={emoji} message={message} isMine={isMine} />
          ))}
        </span>
      );
    }

    // Split by *, _, ~, ` blocks, @mentions, URLs, and emojis while keeping the delimiters
    const parts = text.split(/(\*\*[\s\S]*?\*\*|\*[\s\S]*?\*|_[\s\S]*?_|~[\s\S]*?~|`[\s\S]*?`|@\w+|https?:\/\/[^\s]+|\p{Emoji})/gu);

    return parts.map((part, i) => {
      if (part.startsWith('**') && part.endsWith('**')) return <strong key={i} className="font-bold">{part.slice(2, -2)}</strong>;
      if (part.startsWith('_') && part.endsWith('_')) return <em key={i} className="italic">{part.slice(1, -1)}</em>;
      if (part.startsWith('*') && part.endsWith('*')) return <em key={i} className="italic">{part.slice(1, -1)}</em>;
      if (part.startsWith('~') && part.endsWith('~')) return <del key={i} className="line-through opacity-80">{part.slice(1, -1)}</del>;
      if (part.startsWith('`') && part.endsWith('`')) {
        return <code key={i} className="font-mono text-[13px] bg-black/20 px-1 py-0.5 rounded-[0.35rem]">{part.slice(1, -1)}</code>;
      }
      if (part.startsWith('http://') || part.startsWith('https://')) {
        return (
          <button
            key={i}
            onClick={(e) => {
              e.stopPropagation();
              setPendingLink(part);
              setShowLinkModal(true);
            }}
            className="text-sky-400 hover:text-sky-300 underline cursor-pointer break-all"
          >
            {part}
          </button>
        );
      }
      if (part.startsWith('@') && part.length > 1) {
        const mentionUsername = part.slice(1);
        // Memoize the mention lookup
        const chat = chats.find(c => c.id === message.chatId);
        const members = chat?.members || [];
        const found = members.find((m) => m.user?.username === mentionUsername);
        const foundId = found?.user.id;
        return (
          <span
            key={i}
            className="font-semibold text-sky-300 cursor-pointer hover:underline"
            onClick={(e) => {
              e.stopPropagation();
              if (foundId) onViewProfile?.(foundId);
            }}
          >{part}</span>
        );
      }
      // Check if part is an emoji — render at normal size
      if (/\p{Emoji}/u.test(part) && part.trim().length <= 2) {
        return <span key={i} className="text-base inline-block">{part}</span>;
      }
      return <span key={i}>{part}</span>;
    });
  };

  const handleSwipe = () => {
    if (!selectionMode && !message.isDeleted) {
      setReplyTo(message);
    }
  };

  // Long press handlers for mobile
  const handleTouchStart = (e: React.TouchEvent) => {
    if (selectionMode || message.isDeleted) return;

    const touch = e.touches[0];
    setTouchStartPos({ x: touch.clientX, y: touch.clientY });

    const timer = setTimeout(() => {
      // Long press detected - start selection mode
      onStartSelectionMode?.(message.id);
      setLongPressTimer(null);
    }, 500); // 500ms for long press

    setLongPressTimer(timer);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!touchStartPos || !longPressTimer) return;

    const touch = e.touches[0];
    const deltaX = Math.abs(touch.clientX - touchStartPos.x);
    const deltaY = Math.abs(touch.clientY - touchStartPos.y);

    // Cancel long press if finger moved too much
    if (deltaX > 10 || deltaY > 10) {
      clearTimeout(longPressTimer);
      setLongPressTimer(null);
    }
  };

  const handleTouchEnd = () => {
    if (longPressTimer) {
      clearTimeout(longPressTimer);
      setLongPressTimer(null);
    }
    setTouchStartPos(null);
  };

  // Single click handler for mobile
  const handleMobileClick = (e: React.MouseEvent) => {
    if (selectionMode) {
      onToggleSelect?.(message.id);
      return;
    }

    if (isMobile && !message.isDeleted) {
      // Show context menu on single click for mobile
      handleContextMenu(e);
    }
  };

  return (
    <>
      <motion.div
        ref={bubbleRef}
        className={`flex ${isMine ? 'justify-end' : 'justify-start'} group mb-0.5 relative transition-colors duration-200 ${selectionMode ? 'px-4 -mx-4 cursor-pointer hover:bg-white/5 rounded-xl' : ''
          } ${isSelected ? 'bg-vortex-500/10 hover:bg-vortex-500/20' : ''}`}
        onClick={handleMobileClick}
        onContextMenu={handleContextMenu}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        drag={!selectionMode && !message.isDeleted && isMobile ? "x" : false}
        dragConstraints={{ left: 0, right: isMine ? 0 : 80 }}
        dragElastic={0.2}
        dragMomentum={false}
        onDragStart={() => {
          setIsSwiping(true);
        }}
        onDrag={(_, info) => {
          if (!isMine && info.offset.x > 0) {
            setSwipeX(Math.min(info.offset.x, 80));
          }
        }}
        onDragEnd={(_, info) => {
          if (!isMine && info.offset.x > 60) {
            handleSwipe();
          }
          setIsSwiping(false);
        }}
        animate={{ x: 0 }}
        transition={{ type: "spring", stiffness: 500, damping: 35 }}
      >
        {/* Selection Checkbox */}
        {selectionMode && (
          <div className="absolute left-1 top-1/2 -translate-y-1/2 w-5 h-5 rounded-full border border-white/30 flex items-center justify-center transition-colors">
            {isSelected && <div className="w-5 h-5 rounded-full bg-vortex-500 flex items-center justify-center">
              <Check size={12} className="text-white" />
            </div>}
          </div>
        )}

        {/* Аватар (чужие) */}
        {!isMine && (
          <div className="w-8 flex-shrink-0 mr-2 self-end">
            {showAvatar ? (
              <button onClick={() => onViewProfile?.(message.senderId)}>
                {senderAvatar ? (
                  <img src={senderAvatar} alt="" className="w-8 h-8 rounded-full object-cover" />
                ) : (
                  <div className="w-8 h-8 rounded-full bg-gradient-to-br from-vortex-500 to-purple-600 flex items-center justify-center text-white text-xs font-semibold">
                    {senderName[0]?.toUpperCase() || '?'}
                  </div>
                )}
              </button>
            ) : null}
          </div>
        )}

        <div className={`max-w-[65%] min-w-0 ${isMine ? 'items-end' : 'items-start'} flex flex-col`}>
          {/* Имя отправителя (для групп) */}
          {!isMine && showAvatar && (
            <button
              className="text-xs font-medium text-vortex-400 ml-3 mb-0.5 hover:underline"
              onClick={() => onViewProfile?.(message.senderId)}
            >
              {senderName}
            </button>
          )}

          {/* Reply */}
          {message.replyTo && (
            <div className={`mx-3 mb-1 px-3 py-1.5 rounded-lg border-l-2 border-vortex-500 bg-vortex-500/10 max-w-full`}>
              <p className="text-xs font-medium text-vortex-400 truncate">
                {message.replyTo.sender?.displayName || message.replyTo.sender?.username}
              </p>
              <p className="text-xs text-zinc-400 truncate">{message.quote || message.replyTo.content || t('media')}</p>
            </div>
          )}

          {/* Пузырь */}
          <div
            onContextMenu={handleContextMenu}
            onDoubleClick={handleReply}
            title={t('reply') ? `${t('reply')} (Double Click)` : 'Double click to reply'}
            className={`cursor-pointer rounded-[1.25rem] overflow-hidden transition-all duration-300 ${
              hasImage && !message.content
                ? 'p-0 shadow-none border-none'
                : isMine
                  ? 'bubble-sent text-white shadow-sm px-4 py-2.5 hover:shadow-md hover:brightness-105'
                  : 'bubble-received text-zinc-100 shadow-sm px-4 py-2.5 hover:shadow-md hover:brightness-105'
            }`}
          >
            {/* Рендер пересланного сообщения */}
            {message.forwardedFrom && (
              <div className="mb-2 text-xs opacity-90 border-l-[3px] border-white/30 pl-2">
                <span className="font-medium">{t('forwardedFrom')}: </span>
                {message.forwardedFrom.displayName || message.forwardedFrom.username}
              </div>
            )}

            {/* Media Grid (images + videos) */}
            {(hasImage || hasVideo) && (
              <div className="max-w-full overflow-hidden">
                <MediaGrid
                  media={media.filter((m) => m.type === 'image' || m.type === 'video')}
                  isMine={isMine}
                  hasContent={!!message.content}
                  onFavoriteGif={toggleGifFavorite}
                  favoriteGifs={favoriteGifs}
                />
              </div>
            )}

            {/* Голосовое */}
            {hasVoice && (
              <div className="flex items-center gap-3 w-full max-w-[260px] md:max-w-[280px] py-1 overflow-hidden">
                <audio
                  ref={audioRef}
                  src={media.find((m) => m.type === 'voice')?.url}
                  preload="auto"
                  onError={(e) => {
                    const target = e.target as HTMLAudioElement;
                    console.error('Audio load error:', target.error?.message || 'Unknown error');
                  }}
                />
                <button
                  onClick={toggleAudio}
                  className={`w-11 h-11 md:w-12 md:h-12 rounded-full flex items-center justify-center flex-shrink-0 transition-all duration-200 shadow-lg ${
                    isMine
                      ? 'bg-white/25 hover:bg-white/35 active:scale-95 shadow-white/10'
                      : 'bg-gradient-to-br from-vortex-500 to-vortex-600 hover:from-vortex-600 hover:to-vortex-700 active:scale-95 shadow-vortex-500/30'
                  }`}
                >
                  {isPlaying ? (
                    <Pause size={18} className="text-white drop-shadow-sm" fill="currentColor" />
                  ) : (
                    <Play size={18} className="text-white ml-0.5 drop-shadow-sm" fill="currentColor" />
                  )}
                </button>
                <div className="flex-1 min-w-0">
                  {/* Waveform visualization */}
                  <div
                    className="flex items-end gap-[3px] md:gap-1 h-8 md:h-9 cursor-pointer group flex-1 min-w-0 overflow-hidden"
                    onClick={(e) => {
                      const audio = audioRef.current;
                      if (!audio || !audio.duration) return;
                      const rect = e.currentTarget.getBoundingClientRect();
                      const pct = (e.clientX - rect.left) / rect.width;
                      audio.currentTime = pct * audio.duration;
                      setAudioProgress(pct * 100);
                      if (!isPlaying) toggleAudio();
                    }}
                  >
                    {(waveformBars || Array(28).fill(0.5)).map((val, i) => {
                      const barHeight = Math.max(15, val * 100);
                      const progress = audioProgress / 100;
                      const barProgress = i / 28;
                      const isActive = barProgress < progress;
                      return (
                        <div
                          key={i}
                          className={`flex-1 rounded-full transition-all duration-150 ${
                            isActive
                              ? isMine
                                ? 'bg-white shadow-sm'
                                : 'bg-vortex-300 shadow-sm'
                              : isMine
                                ? 'bg-white/30 group-hover:bg-white/40'
                                : 'bg-white/20 group-hover:bg-white/30'
                          }`}
                          style={{ height: `${barHeight}%`, minWidth: '2px' }}
                        />
                      );
                    })}
                  </div>
                  <div className="flex items-center justify-between mt-1.5">
                    <span className={`text-xs font-medium ${isMine ? 'text-white/80' : 'text-zinc-400'}`}>
                      {isPlaying
                        ? formatDuration(audioRef.current?.currentTime || 0)
                        : formatDuration(audioDuration || message.media?.find((m) => m.type === 'voice')?.duration || 0)}
                    </span>
                    <span className={`text-[10px] font-medium ${isMine ? 'text-white/60' : 'text-zinc-500'}`}>
                      {isPlaying ? 'Воспроизведение...' : 'Голосовое'}
                    </span>
                  </div>
                </div>
              </div>
            )}

            {/* Аудио (mp3 файлы) */}
            {hasAudio && (() => {
              const audioMedia = media.find((m) => m.type === 'audio');
              const fileName = audioMedia?.filename || 'Аудио';
              const nameWithoutExt = fileName.replace(/\.[^/.]+$/, '');
              const title = nameWithoutExt;
              const artist = isMine ? 'Вы' : message.sender?.displayName || message.sender?.username || 'Неизвестный исполнитель';
              const isMp3 = !!audioMedia?.filename?.toLowerCase().endsWith('.mp3');
              
              return (
                <div 
                  className="w-full max-w-[280px] md:max-w-[320px] py-3 px-3 rounded-2xl bg-gradient-to-br from-purple-500/15 to-pink-500/10 border border-white/10 hover:border-white/20 transition-all duration-300 group overflow-hidden"
                  onMouseEnter={() => {
                    if (audioRef.current) audioRef.current.volume = audioVolume;
                  }}
                >
                  <audio
                    ref={audioRef}
                    src={audioMedia?.url}
                    preload="auto"
                    onError={(e) => console.error('Audio load error:', e)}
                    volume={audioVolume}
                  />
                  
                  <div className="flex items-start gap-3">
                    {/* Album art / icon */}
                    <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center flex-shrink-0 shadow-lg group-hover:shadow-xl group-hover:scale-105 transition-all duration-300">
                      <Music size={24} className="text-white" />
                    </div>
                    
                    {/* Title and artist */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <div className="flex flex-col">
                          <p className="text-sm font-semibold text-white truncate flex items-center">
                            {title}
                            {isMp3 && (<span className="ml-2 text-xs text-white/60 bg-white/10 rounded px-1 py-0.5">MP3</span>)}
                          </p>
                          {audioMedia?.size ? (<p className="text-xs text-white/50 mt-0.5">{(audioMedia.size / 1024).toFixed(1)} KB</p>) : null}
                        </div>
                        
                        {/* Download button with hover animation */}
                        <div className="relative">
                          <a
                            href={audioMedia?.url}
                            download={fileName}
                            onClick={(e) => e.stopPropagation()}
                            className="p-2 rounded-xl bg-white/10 hover:bg-white/20 opacity-0 group-hover:opacity-100 translate-y-1 group-hover:translate-y-0 transition-all duration-300 flex items-center justify-center"
                            title="Скачать"
                          >
                            <Download size={16} className="text-white" />
                          </a>
                        </div>
                      </div>
                      <p className="text-xs text-white/50 truncate mt-0.5">{artist}</p>
                    </div>
                  </div>
                  
                  {/* Enhanced Player */}
                  <div className="mt-4 flex items-center gap-3">
                    <button
                      onClick={toggleAudio}
                      className="w-10 h-10 rounded-full bg-white/20 hover:bg-white/30 flex items-center justify-center flex-shrink-0 transition-all active:scale-95 shadow-lg hover:shadow-xl"
                    >
                      {isPlaying ? (
                        <Pause size={16} className="text-white" fill="currentColor" />
                      ) : (
                        <Play size={16} className="text-white ml-0.5" fill="currentColor" />
                      )}
                    </button>
                    
                    {/* Progress bar with seeking */}
                    <div className="flex-1 min-w-0">
                      {/* Time and progress bar */}
                      <div 
                        className="relative h-2 bg-white/15 rounded-full cursor-pointer group/progress overflow-visible"
                        onClick={(e) => handleSeek(e, audioDuration || 0)}
                        onMouseMove={(e) => handleProgressHover(e, audioDuration || 0)}
                        onMouseLeave={() => setHoverTime(null)}
                      >
                        {/* Hover time preview */}
                        {hoverTime !== null && (
                          <div 
                            className="absolute -top-8 px-2 py-1 bg-black/80 rounded-lg text-xs text-white pointer-events-none transform -translate-x-1/2 whitespace-nowrap"
                            style={{ left: `${(hoverTime / (audioDuration || 1)) * 100}%` }}
                          >
                            {formatDuration(hoverTime)}
                          </div>
                        )}
                        
                        {/* Progress fill */}
                        <div 
                          className="absolute left-0 top-0 h-full bg-gradient-to-r from-purple-400 to-pink-400 rounded-full transition-all group-hover/progress:bg-gradient-to-r group-hover/progress:from-purple-300 group-hover/progress:to-pink-300"
                          style={{ width: `${audioProgress}%` }}
                        />
                        
                        {/* Draggable knob - always visible */}
                        <div 
                          className="absolute top-1/2 w-4 h-4 bg-white rounded-full shadow-lg transition-opacity"
                          style={{ 
                            left: `clamp(0px, calc(${audioProgress}% - 8px), calc(100% - 16px))`,
                            top: '50%',
                            transform: 'translateY(-50%)',
                            opacity: '1'
                          }}
                        />
                      </div>
                      
                      {/* Time display */}
                      <div className="flex justify-between mt-1.5">
                        <span className="text-[11px] text-white/60 font-medium tabular-nums">
                          {isPlaying 
                            ? formatDuration(audioRef.current?.currentTime || 0) 
                            : '0:00'}
                        </span>
                        <span className="text-[11px] text-white/60 font-medium tabular-nums">
                          {formatDuration(audioDuration || 0)}
                        </span>
                      </div>
                    </div>
                    
                    {/* Volume control */}
                    <div className="relative flex-shrink-0">
                      <button
                        onClick={() => setShowVolumeSlider(!showVolumeSlider)}
                        className="p-2 rounded-lg hover:bg-white/10 transition-colors"
                        title="Громкость"
                      >
                        {audioVolume === 0 ? (
                          <Volume2 size={16} className="text-white/70" />
                        ) : audioVolume < 0.5 ? (
                          <Volume2 size={16} className="text-white/70" />
                        ) : (
                          <Volume2 size={16} className="text-white/70" />
                        )}
                      </button>
                      
                      {/* Volume slider popup - stays within viewport bounds */}
                      {showVolumeSlider && (
                        <>
                          <div 
                            className="fixed inset-0 z-40" 
                            onClick={() => setShowVolumeSlider(false)}
                          />
                          <div 
                            className="absolute bottom-full right-0 mb-2 p-3 bg-black/90 backdrop-blur-xl rounded-xl border border-white/10 shadow-xl z-50"
                            style={{ 
                              marginBottom: '8px',
                              maxWidth: 'min(90vw, 200px)',
                              right: '0'
                            }}
                          >
                            <div className="flex flex-col items-center gap-1">
                              <button
                                onClick={() => {
                                  handleVolumeChange(audioVolume > 0 ? 0 : 0.7);
                                }}
                                className="p-1 hover:bg-white/10 rounded transition-colors"
                              >
                                {audioVolume === 0 ? (
                                  <Volume2 size={14} className="text-white/50" />
                                ) : (
                                  <Volume2 size={14} className="text-white/70" />
                                )}
                              </button>
                              
                              <div 
                                ref={volumeSliderRef}
                                className={`h-24 w-1.5 bg-white/20 rounded-full relative cursor-pointer group/vol transition-all ${isDraggingVolume ? 'scale-125' : ''}`}
                                onMouseDown={(e) => {
                                  e.stopPropagation();
                                  setIsDraggingVolume(true);
                                  const rect = e.currentTarget.getBoundingClientRect();
                                  const pct = 1 - Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));
                                  handleVolumeChange(pct);
                                }}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  const rect = e.currentTarget.getBoundingClientRect();
                                  const pct = 1 - Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));
                                  handleVolumeChange(pct);
                                }}
                              >
                                <div 
                                  className="absolute bottom-0 left-0 w-full bg-gradient-to-t from-purple-400 to-pink-400 rounded-full transition-all"
                                  style={{ height: `${audioVolume * 100}%` }}
                                />
                                <div 
                                  className={`absolute w-3 h-3 bg-white rounded-full shadow-lg -translate-x-1/2 transition-all ${isDraggingVolume ? 'scale-125' : 'opacity-0 group-hover/vol:opacity-100'}`}
                                  style={{ bottom: `calc(${audioVolume * 100}% - 6px)`, left: '50%' }}
                                />
                                {/* Drag indicator */}
                                {isDraggingVolume && (
                                  <div className="absolute -right-1 top-1/2 -translate-y-1/2 w-2 h-2 bg-white rounded-full shadow-lg animate-pulse" />
                                )}
                              </div>
                              
                              <span className="text-[10px] text-white/50 mt-1">{Math.round(audioVolume * 100)}%</span>
                            </div>
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              );
            })()}

            {/* Файлы */}
            {hasFile &&
              media
                .filter((m) => m.type !== 'image' && m.type !== 'voice' && m.type !== 'video')
                .map((m, idx) => (
                  <a
                    key={`${m.id}-${idx}`}
                    href={m.url}
                    download={m.filename || 'file'}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={`flex items-center gap-3 p-2 rounded-xl ${isMine ? 'bg-white/10 hover:bg-white/15' : 'bg-surface-tertiary hover:bg-surface-hover'
                      } transition-colors mb-1`}
                  >
                    <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${isMine ? 'bg-white/20' : 'bg-vortex-500/20'
                      }`}>
                      <FileText size={20} className={isMine ? 'text-white' : 'text-vortex-400'} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm truncate">{m.filename || t('fileLabel')}</p>
                      <p className={`text-xs ${isMine ? 'text-white/50' : 'text-zinc-500'}`}>
                        {m.size ? `${(m.size / 1024).toFixed(1)} ${t('kb')}` : t('download')}
                      </p>
                    </div>
                    <Download size={16} className={isMine ? 'text-white/50' : 'text-zinc-500'} />
                  </a>
                ))}

            {/* Текст */}
            {message.content && !is67Message && (
              <div className="flex items-end gap-2">
                <p className="text-sm whitespace-pre-wrap break-words flex-1 leading-relaxed" style={{ overflowWrap: 'break-word', wordBreak: 'break-word' }}>
                  {renderFormattedText(message.content)}
                </p>
                <span className={`text-[10px] flex-shrink-0 flex items-center gap-0.5 self-end ${isMine ? 'text-white/50' : 'text-zinc-500'
                  }`}>
                  {message.isEdited && <span>{t('edited')}</span>}
                  {message.scheduledAt && <Clock size={11} className="text-amber-400 mr-0.5" />}
                  {timeStr}
                  {isMine && !message.scheduledAt && (
                    isRead ? (
                      <CheckCheck size={13} className="text-sky-300 ml-0.5" />
                    ) : (
                      <Check size={13} className="ml-0.5" />
                    )
                  )}
                </span>
              </div>
            )}

            {/* Special 67 - Clickable preview */}
            {is67Message && (
              <div
                onClick={open67Modal}
                className="relative flex items-center justify-center cursor-pointer hover:scale-105 transition-transform overflow-hidden rounded-xl"
                style={{ width: '200px', height: '150px' }}
              >
                <img
                  src="/67.gif"
                  alt="67"
                  className="w-full h-full object-cover"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent" />

                <span className={`absolute bottom-2 right-2 text-[10px] flex-shrink-0 flex items-center gap-0.5 ${isMine ? 'text-white/70' : 'text-white/70'}`}>
                  {timeStr}
                  {isMine && !message.scheduledAt && (
                    isRead ? (
                      <CheckCheck size={13} className="text-sky-300 ml-0.5" />
                    ) : (
                      <Check size={13} className="ml-0.5" />
                    )
                  )}
                </span>
              </div>
            )}

            {/* YouTube Preview - DISABLED */}
            {/* {youtubePreview && (
              <div className={`${message.content ? 'mt-2' : ''}`}>
                {(youtubePreview.author || youtubePreview.title) && (
                  <div className="mb-2 px-1">
                    {youtubePreview.author && (
                      <p className="text-xs text-zinc-400 mb-1">{youtubePreview.author}</p>
                    )}
                    {youtubePreview.title && (
                      <p className="text-sm font-medium text-zinc-200 line-clamp-2">{youtubePreview.title}</p>
                    )}
                  </div>
                )}
                <a
                  href={`https://www.youtube.com/watch?v=${youtubePreview.videoId}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`block rounded-xl overflow-hidden border transition-all hover:brightness-95 ${
                    isMine ? 'border-white/10 bg-white/5' : 'border-white/10 bg-black/20'
                  }`}
                  onClick={(e) => e.stopPropagation()}
                >
                  <div className="relative aspect-video bg-black">
                    <img
                      src={`https://img.youtube.com/vi/${youtubePreview.videoId}/maxresdefault.jpg`}
                      alt={youtubePreview.title || 'YouTube video'}
                      className="w-full h-full object-cover"
                      onError={(e) => {
                        e.currentTarget.src = `https://img.youtube.com/vi/${youtubePreview.videoId}/hqdefault.jpg`;
                      }}
                    />
                    <div className="absolute inset-0 flex items-center justify-center bg-black/30">
                      <div className="w-16 h-16 rounded-full bg-red-600 flex items-center justify-center shadow-lg">
                        <Play size={28} className="text-white ml-1" fill="white" />
                      </div>
                    </div>
                  </div>
                </a>
              </div>
            )} */}

            {/* Время для медиа без текста */}
            {!message.content && (hasImage || hasVideo) && (
              <div className={`flex justify-end px-3 py-1 ${hasImage ? '-mt-8 relative z-10' : ''}`}>
                <span className="text-[10px] text-white/70 bg-black/40 px-2 py-0.5 rounded-full flex items-center gap-1 backdrop-blur-sm">
                  {timeStr}
                  {isMine && (
                    isRead ? (
                      <CheckCheck size={13} className="text-sky-300" />
                    ) : (
                      <Check size={13} />
                    )
                  )}
                </span>
              </div>
            )}
          </div>

          {/* Реакции */}
          {Object.keys(reactionGroups).length > 0 && (
            <div className="flex flex-wrap gap-1 mt-1 mx-1">
              {Object.entries(reactionGroups).map(([emoji, data]) => (
                <button
                  key={emoji}
                  onClick={() => handleReaction(emoji)}
                  className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-xs transition-colors ${data.isMine
                    ? 'bg-vortex-500/30 border border-vortex-500/50'
                    : 'bg-surface-tertiary border border-border hover:border-zinc-600'
                    }`}
                  title={data.users.join(', ')}
                >
                  <span>{emoji}</span>
                  <span className="text-zinc-400">{data.count}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Аватар (свои) */}
        {isMine && (
          <div className="w-8 flex-shrink-0 ml-2 self-end">
            {showAvatar ? (
              <button onClick={() => onViewProfile?.(message.senderId)}>
                {senderAvatar ? (
                  <img src={senderAvatar} alt="" className="w-8 h-8 rounded-full object-cover" />
                ) : (
                  <div className="w-8 h-8 rounded-full bg-gradient-to-br from-vortex-500 to-purple-600 flex items-center justify-center text-white text-xs font-semibold">
                    {senderName[0]?.toUpperCase() || '?'}
                  </div>
                )}
              </button>
            ) : null}
          </div>
        )}

        {/* Reply icon on swipe */}
        <AnimatePresence>
          {!isMine && swipeX > 0 && (
            <motion.div
              className="absolute left-2 top-1/2 -translate-y-1/2 pointer-events-none"
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: swipeX > 5 ? 1 : 0, scale: swipeX > 5 ? 1 : 0.8 }}
              exit={{ opacity: 0, scale: 0.8 }}
              transition={{ duration: 0.2 }}
            >
              <div className="relative w-8 h-8">
                {/* Background circle */}
                <div className="absolute inset-0 rounded-full bg-white/10" />

                {/* Filling background */}
                <div
                  className="absolute inset-0 rounded-full bg-vortex-500"
                  style={{
                    transform: `scale(${Math.min(swipeX / 60, 1)})`,
                    opacity: Math.min(swipeX / 60, 1)
                  }}
                />

                {/* Bubbles when fully filled */}
                {swipeX >= 60 && (
                  <>
                    {[...Array(6)].map((_, i) => (
                      <motion.div
                        key={i}
                        initial={{ scale: 0, x: 0, y: 0 }}
                        animate={{
                          scale: [0, 1, 0],
                          x: [0, Math.cos((i * Math.PI) / 3) * 20],
                          y: [0, Math.sin((i * Math.PI) / 3) * 20],
                          opacity: [0, 1, 0]
                        }}
                        transition={{
                          duration: 0.6,
                          delay: i * 0.05,
                          ease: "easeOut"
                        }}
                        className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-2 h-2 rounded-full bg-vortex-400"
                      />
                    ))}
                  </>
                )}

                {/* Stroke circle */}
                <svg className="absolute inset-0 w-8 h-8 -rotate-90">
                  <circle
                    cx="16"
                    cy="16"
                    r="14"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    className="text-vortex-500 transition-all duration-200"
                    strokeDasharray={`${2 * Math.PI * 14}`}
                    strokeDashoffset={`${2 * Math.PI * 14 * (1 - Math.min(swipeX / 60, 1))}`}
                    style={{
                      opacity: swipeX >= 60 ? 0 : 1
                    }}
                  />
                </svg>

                {/* Reply icon */}
                <div className="absolute inset-0 flex items-center justify-center">
                  <Reply
                    size={16}
                    className="text-white transition-all duration-200"
                    style={{
                      opacity: Math.min(swipeX / 30, 1),
                      transform: `scale(${Math.min(swipeX / 30, 1)}) rotate(${swipeX >= 60 ? -15 : 0}deg)`
                    }}
                  />
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>

      {/* Контекстное меню */}
      {typeof document !== 'undefined' && createPortal(
        <AnimatePresence>
          {showContext && (
            <motion.div
              ref={contextMenuRef}
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="fixed z-[9999] w-52 rounded-[1.25rem] glass-strong shadow-2xl py-1.5 overflow-hidden border border-white/10"
              style={{ left: contextPos.x, top: contextPos.y }}
              onClick={(e) => e.stopPropagation()}
              onContextMenu={(e) => {
                e.preventDefault();
                e.stopPropagation();
              }}
            >
              {deleteMenuMode ? (
                <>
                  {/* Delete submenu */}
                  <div className="flex items-center gap-2 px-3 py-2.5 border-b border-border">
                    <button
                      onClick={() => setDeleteMenuMode(false)}
                      className="p-1 rounded-lg hover:bg-surface-hover transition-colors text-zinc-400 hover:text-white"
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6" /></svg>
                    </button>
                    <span className="text-sm font-medium text-zinc-300">{t('delete')}</span>
                  </div>
                  <button
                    onClick={handleDeleteForMe}
                    className="flex items-center gap-3 w-full px-4 py-2.5 text-sm text-zinc-300 hover:bg-surface-hover hover:text-white transition-colors"
                  >
                    <Trash2 size={16} className="text-zinc-400" />
                    {t('deleteForMe')}
                  </button>
                  <button
                    onClick={handleDeleteForAll}
                    className="flex items-center gap-3 w-full px-4 py-2.5 text-sm text-red-400 hover:bg-red-500/10 hover:text-red-300 transition-colors"
                  >
                    <Trash2 size={16} />
                    {chatForDelete?.type === 'personal' && otherMemberName
                      ? `${t('deleteAlsoFor')} ${otherMemberName}`
                      : t('deleteForAll')}
                  </button>
                </>
              ) : (
                <>
              {/* Быстрые реакции */}
              <div className="flex items-center gap-1 px-3 py-2 border-b border-border">
                {['👍', '❤️', '😂', '😮', '😢', '🔥'].map((emoji) => (
                  <button
                    key={emoji}
                    onClick={() => handleReaction(emoji)}
                    className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-surface-hover transition-colors text-lg"
                  >
                    {emoji}
                  </button>
                ))}
              </div>

              <button
                onClick={handleReply}
                className="flex items-center gap-3 w-full px-4 py-2.5 text-sm text-zinc-300 hover:bg-surface-hover hover:text-white transition-colors"
              >
                <Reply size={16} />
                {quotedText ? t('replyWithQuote') : t('reply')}
              </button>

              <button
                onClick={() => {
                  setShowContext(false);
                  onStartSelectionMode?.(message.id);
                }}
                className="flex items-center gap-3 w-full px-4 py-2.5 text-sm text-zinc-300 hover:bg-surface-hover hover:text-white transition-colors"
              >
                <CheckCheck size={16} />
                {t('select')}
              </button>

              <button
                onClick={handlePin}
                className="flex items-center gap-3 w-full px-4 py-2.5 text-sm text-zinc-300 hover:bg-surface-hover hover:text-white transition-colors"
              >
                <Pin size={16} />
                {isPinned ? t('unpinMessage') : t('pinMessage')}
              </button>

              {message.content && (
                <button
                  onClick={handleCopy}
                  className="flex items-center gap-3 w-full px-4 py-2.5 text-sm text-zinc-300 hover:bg-surface-hover hover:text-white transition-colors"
                >
                  <Copy size={16} />
                  {t('copy')}
                </button>
              )}

              {isMine && message.content && (
                <button
                  onClick={handleEdit}
                  className="flex items-center gap-3 w-full px-4 py-2.5 text-sm text-zinc-300 hover:bg-surface-hover hover:text-white transition-colors"
                >
                  <Pencil size={16} />
                  {t('edit')}
                </button>
              )}

              <div className="border-t border-border my-1" />
              <button
                onClick={() => setDeleteMenuMode(true)}
                className="flex items-center gap-3 w-full px-4 py-2.5 text-sm text-red-400 hover:bg-red-500/10 transition-colors"
              >
                <Trash2 size={16} />
                {t('delete')}
              </button>
                </>
              )}
            </motion.div>
          )}
        </AnimatePresence>,
        document.body
      )}

      {/* Link confirmation modal */}
      <AnimatePresence>
        {showLinkModal && pendingLink && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[200]"
              onClick={() => {
                setShowLinkModal(false);
                setPendingLink(null);
              }}
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-md z-[201]"
            >
              <div className="bg-surface-secondary border border-border rounded-2xl shadow-2xl p-6 mx-4">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-12 h-12 rounded-full bg-amber-500/20 flex items-center justify-center flex-shrink-0">
                    <ExternalLink size={20} className="text-amber-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="text-lg font-semibold text-white">{t('openLink')}</h3>
                    <p className="text-sm text-zinc-400 mt-0.5">{t('linkWarning')}</p>
                  </div>
                </div>

                <div className="bg-black/20 rounded-xl p-3 mb-4 border border-white/5">
                  <p className="text-xs text-zinc-400 mb-1 font-medium">{t('link')}:</p>
                  <p className="text-sm text-vortex-400 break-all">{pendingLink}</p>
                </div>

                <div className="flex gap-3">
                  <button
                    onClick={() => {
                      setShowLinkModal(false);
                      setPendingLink(null);
                    }}
                    className="flex-1 px-4 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-zinc-300 hover:text-white transition-all text-sm font-medium"
                  >
                    {t('cancel')}
                  </button>
                  <button
                    onClick={() => {
                      if (pendingLink) {
                        window.open(pendingLink, '_blank', 'noopener,noreferrer');
                      }
                      setShowLinkModal(false);
                      setPendingLink(null);
                    }}
                    className="flex-1 px-4 py-2.5 rounded-xl bg-vortex-500 hover:bg-vortex-600 text-white transition-all text-sm font-medium flex items-center justify-center gap-2"
                  >
                    <ExternalLink size={16} />
                    {t('open')}
                  </button>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* 67 Fullscreen Modal */}
      {is67Message && createPortal(
        <AnimatePresence>
          {show67Modal && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-[99999] flex items-center justify-center"
              onClick={close67Modal}
            >
              {/* Blurred background */}
              <div className="absolute inset-0 backdrop-blur-xl bg-black/80" />

              {/* Audio */}
              <audio ref={audioRef67} src="/gazan.mp3" loop preload="auto" />

              {/* Content */}
              <motion.div
                initial={{ scale: 0.5, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.5, opacity: 0 }}
                transition={{ duration: 0.5, ease: "easeOut" }}
                className="relative z-10 w-[90vw] h-[90vh] max-w-4xl max-h-[600px]"
                onClick={(e) => e.stopPropagation()}
              >
                {/* Close button */}
                <button
                  onClick={close67Modal}
                  className="absolute -top-12 right-0 w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 backdrop-blur-md flex items-center justify-center transition-all z-20"
                >
                  <X size={24} className="text-white" />
                </button>

                {/* Background image */}
                <motion.div
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ duration: 0.8 }}
                  className="absolute inset-0 rounded-3xl overflow-hidden"
                >
                  <img
                    src="/maxresdefault.jpg"
                    alt=""
                    className="w-full h-full object-cover opacity-50"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/60 to-black/40" />
                </motion.div>

                {/* 67.gif overlay */}
                <motion.div
                  initial={{ opacity: 0, scale: 0.5 }}
                  animate={{ opacity: 0.7, scale: 1 }}
                  transition={{ duration: 1, delay: 0.3 }}
                  className="absolute inset-0 rounded-3xl overflow-hidden z-[1]"
                >
                  <img
                    src="/67.gif"
                    alt=""
                    className="w-full h-full object-cover mix-blend-screen"
                  />
                </motion.div>

                {/* Pulsating glow */}
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: [0, 1, 0] }}
                  transition={{
                    duration: 2,
                    repeat: Infinity,
                    ease: "easeInOut"
                  }}
                  className="absolute inset-0 bg-gradient-to-r from-purple-500/30 via-pink-500/30 to-purple-500/30 rounded-3xl blur-3xl z-[2]"
                />
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>,
        document.body
      )}
    </>
  );
}

export default memo(MessageBubble);
