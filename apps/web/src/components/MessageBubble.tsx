import React, { useState, useRef, useEffect, memo, useMemo, useCallback, lazy, Suspense } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Check,
  CheckCheck,
  Clock,
  Reply,
  X,
  RotateCw,
} from 'lucide-react';
import { useAuthStore } from '../stores/authStore';
import { useChatStore } from '../stores/chatStore';
import { useLang } from '../lib/i18n';
import { api } from '../lib/api';
import type { Message } from '../lib/types';
import LazyMedia from './LazyMedia';
import { MessageText, MessageVoice, MessageAudio, MessageFile, MessageReactions, MessageContextMenu } from './message';

const MediaGrid = lazy(() => import('./MediaGrid'));

function MediaFallback() {
  return <div className="w-full h-32 bg-white/5 rounded-xl animate-pulse" />;
}

class MediaErrorBoundary extends React.Component<
  { children: React.ReactNode; fallback?: React.ReactNode },
  { hasError: boolean }
> {
  state = { hasError: false };
  static getDerivedStateFromError() { return { hasError: true }; }
  render() {
    if (this.state.hasError) {
      return this.props.fallback || <div className="w-full h-24 bg-white/5 rounded-xl flex items-center justify-center text-zinc-500 text-xs">Медиа не загрузилось</div>;
    }
    return this.props.children;
  }
}

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
  const setReplyTo = useChatStore((s) => s.setReplyTo);
  const retryMessage = useChatStore((s) => s.retryMessage);
  const { t, lang } = useLang();

  const pinnedMessages = useChatStore(s => s.pinnedMessages[message.chatId]);

  const [showContext, setShowContext] = useState(false);
  const [contextPos, setContextPos] = useState({ x: 0, y: 0 });
  const [quotedText, setQuotedText] = useState<string | null>(null);
  const [swipeX, setSwipeX] = useState(0);
  const [isSwiping, setIsSwiping] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [show67Modal, setShow67Modal] = useState(false);
  const audioRef67 = useRef<HTMLAudioElement>(null);
  const bubbleRef = useRef<HTMLDivElement>(null);
  const bubbleContentRef = useRef<HTMLDivElement>(null);
  const [longPressTimer, setLongPressTimer] = useState<ReturnType<typeof setTimeout> | null>(null);
  const [touchStartPos, setTouchStartPos] = useState<{ x: number; y: number } | null>(null);

  const is67Message = message.content?.trim() === '67' && !message.media?.length;

  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth <= 768 || 'ontouchstart' in window);
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  useEffect(() => {
    if (!isSwiping) {
      const timer = setTimeout(() => setSwipeX(0), 300);
      return () => clearTimeout(timer);
    }
  }, [isSwiping]);

  const isPinned = pinnedMessages?.id === message.id;
  const isRead = message.readBy?.some((r) => r.userId !== user?.id);

  const timeStr = useMemo(() => new Date(message.createdAt).toLocaleTimeString(lang === 'ru' ? 'ru-RU' : 'en-US', {
    hour: '2-digit',
    minute: '2-digit',
  }), [message.createdAt, lang]);

  const media = useMemo(() => message.media || [], [message.media]);
  const hasImage = useMemo(() => media.some((m) => m.type === 'image'), [media]);
  const hasVoice = useMemo(() => message.type === 'voice' || media.some((m) => m.type === 'voice'), [message.type, media]);
  const hasAudio = useMemo(() => message.type === 'audio' || media.some((m) => m.type === 'audio'), [message.type, media]);
  const hasFile = useMemo(() => media.some((m) => m.type !== 'image' && m.type !== 'voice' && m.type !== 'video' && m.type !== 'audio'), [media]);
  const hasVideo = useMemo(() => media.some((m) => m.type === 'video'), [media]);

  const FAVORITES_KEY = 'vortex_favorite_gifs';
  const [favoriteGifUrls, setFavoriteGifUrls] = useState<string[]>(() => {
    try {
      const favs: { url: string }[] = JSON.parse(localStorage.getItem(FAVORITES_KEY) || '[]');
      return favs.map((f) => f.url);
    } catch { return []; }
  });

  const handleToggleFavoriteGif = useCallback((gifUrl: string) => {
    try {
      const favs: { id: string; url: string; preview: string; title: string }[] = JSON.parse(localStorage.getItem(FAVORITES_KEY) || '[]');
      const idx = favs.findIndex((f) => f.url === gifUrl);
      if (idx >= 0) {
        favs.splice(idx, 1);
      } else {
        favs.unshift({ id: gifUrl, url: gifUrl, preview: gifUrl, title: '' });
      }
      localStorage.setItem(FAVORITES_KEY, JSON.stringify(favs));
      setFavoriteGifUrls(favs.map((f) => f.url));
    } catch { /* ignore */ }
  }, []);

  const senderName = message.sender?.displayName || message.sender?.username || '';
  const senderAvatar = message.sender?.avatar;

  // Context menu
  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (selectionMode) {
      onToggleSelect?.(message.id);
      return;
    }
    const selection = window.getSelection();
    const text = selection?.toString().trim();
    if (text && bubbleRef.current?.contains(selection?.anchorNode || null)) {
      setQuotedText(text);
    } else {
      setQuotedText(null);
    }
    const menuWidth = 208;
    const menuHeight = 350;
    let x = e.clientX;
    let y = e.clientY;
    if (x + menuWidth > window.innerWidth) x = window.innerWidth - menuWidth - 8;
    if (y + menuHeight > window.innerHeight) y = window.innerHeight - menuHeight - 8;
    setContextPos({ x, y });
    setShowContext(true);
  };

  const handleReply = () => {
    setReplyTo({ ...message, quote: quotedText });
    setShowContext(false);
    setQuotedText(null);
  };

  // 67 easter egg
  const close67Modal = () => {
    setShow67Modal(false);
    if (audioRef67.current) { audioRef67.current.pause(); audioRef67.current.currentTime = 0; }
  };
  const open67Modal = () => {
    setShow67Modal(true);
    setTimeout(() => { audioRef67.current?.play().catch(() => {}); }, 100);
  };

  // Swipe to reply
  const handleSwipe = () => {
    if (!selectionMode && !message.isDeleted) setReplyTo(message);
  };

  // Touch handlers — long-press (context menu) and swipe-to-reply share the
  // same gesture so they can't both fire. swipeX still drives the existing
  // reply-indicator UI below; only the engine moving it changed.
  const swipeActiveRef = useRef(false);
  const swipeXRef = useRef(0);
  const handleTouchStart = (e: React.TouchEvent) => {
    if (selectionMode || message.isDeleted) return;
    const touch = e.touches[0];
    setTouchStartPos({ x: touch.clientX, y: touch.clientY });
    swipeActiveRef.current = false;
    swipeXRef.current = 0;
    const timer = setTimeout(() => {
      onStartSelectionMode?.(message.id);
      setLongPressTimer(null);
    }, 500);
    setLongPressTimer(timer);
  };
  const handleTouchMove = (e: React.TouchEvent) => {
    if (!touchStartPos) return;
    const touch = e.touches[0];
    const deltaX = touch.clientX - touchStartPos.x;
    const deltaY = touch.clientY - touchStartPos.y;
    // Once horizontal movement dominates, treat this as a swipe-to-reply
    // gesture instead of a long-press, and cancel the long-press timer.
    if (!swipeActiveRef.current && Math.abs(deltaX) > 10 && Math.abs(deltaX) > Math.abs(deltaY)) {
      swipeActiveRef.current = true;
      setIsSwiping(true);
      if (longPressTimer) { clearTimeout(longPressTimer); setLongPressTimer(null); }
    } else if (!swipeActiveRef.current && (Math.abs(deltaX) > 10 || Math.abs(deltaY) > 10)) {
      // Movement dominated by vertical scroll — cancel long-press, don't swipe
      if (longPressTimer) { clearTimeout(longPressTimer); setLongPressTimer(null); }
      return;
    }
    if (swipeActiveRef.current && deltaX < 0) {
      const clamped = Math.max(deltaX, -80);
      swipeXRef.current = clamped;
      setSwipeX(clamped);
    }
  };
  const handleTouchEnd = () => {
    if (longPressTimer) { clearTimeout(longPressTimer); setLongPressTimer(null); }
    if (swipeActiveRef.current) {
      if (swipeXRef.current < -60) handleSwipe();
      swipeActiveRef.current = false;
      setIsSwiping(false);
    }
    setTouchStartPos(null);
  };

  const handleMobileClick = (e: React.MouseEvent) => {
    if (selectionMode) { onToggleSelect?.(message.id); return; }
    if (isMobile && !message.isDeleted) {
      // Only open context menu if click is on the actual bubble content, not empty space
      const target = e.target as Node;
      if (!bubbleContentRef.current?.contains(target)) return;
      if (showContext) {
        setShowContext(false);
        setQuotedText(null);
      } else {
        handleContextMenu(e);
      }
    }
  };

  // Deleted message auto-hide
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

  return (
    <>
      <div
        ref={bubbleRef}
        className={`flex ${isMine ? 'justify-end' : 'justify-start'} group mb-0.5 relative message-bubble-enter ${selectionMode ? 'pl-10 pr-4 cursor-pointer hover:bg-white/5 rounded-xl' : ''
          } ${isSelected ? 'bg-vortex-500/10 hover:bg-vortex-500/20' : ''} ${message.pending && !message.failed ? 'opacity-80' : ''} ${message.failed ? 'opacity-60 ring-1 ring-red-500/40 rounded-2xl' : ''}`}
        onClick={handleMobileClick}
        onContextMenu={handleContextMenu}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        style={{
          transform: swipeX < 0 ? `translateX(${swipeX}px)` : undefined,
          transition: isSwiping ? 'background-color 0.2s' : 'transform 0.25s ease-out, background-color 0.2s',
          willChange: isSwiping ? 'transform' : undefined,
        }}

        {...(isSwiping ? { 'data-swiping': 'true' } : {})}
      >
        {/* Selection Checkbox */}
        {selectionMode && (
          <motion.div
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: 'spring', stiffness: 500, damping: 25 }}
            className="absolute left-1 top-1/2 -translate-y-1/2 w-5 h-5 rounded-full border border-white/30 flex items-center justify-center"
          >
            <AnimatePresence>
              {isSelected ? (
                <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} exit={{ scale: 0 }} transition={{ type: 'spring', stiffness: 600, damping: 20 }} className="w-5 h-5 rounded-full bg-vortex-500 flex items-center justify-center">
                  <Check size={12} className="text-white" strokeWidth={3} />
                </motion.div>
              ) : (
                <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} exit={{ scale: 0 }} className="w-5 h-5 rounded-full bg-transparent" />
              )}
            </AnimatePresence>
          </motion.div>
        )}

        {/* Avatar (others) */}
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
          {/* Sender name (groups) */}
          {!isMine && showAvatar && (
            <button className="text-xs font-medium text-vortex-400 ml-3 mb-0.5 hover:underline" onClick={() => onViewProfile?.(message.senderId)}>
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

          {/* Bubble */}
          <div
            ref={bubbleContentRef}
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
            {/* Forwarded */}
            {message.forwardedFrom && (
              <div className="mb-2 text-xs opacity-90 border-l-[3px] border-white/30 pl-2">
                <span className="font-medium">{t('forwardedFrom')}: </span>
                {message.forwardedFrom.displayName || message.forwardedFrom.username}
              </div>
            )}

            {/* Media (images + videos) */}
            {(hasImage || hasVideo) && (
              <MediaErrorBoundary>
                <LazyMedia className="max-w-full overflow-hidden">
                  <Suspense fallback={<MediaFallback />}>
                    <MediaGrid
                      media={media.filter((m) => m.type === 'image' || m.type === 'video')}
                      isMine={isMine}
                      hasContent={!!message.content}
                      onFavoriteGif={handleToggleFavoriteGif}
                      favoriteGifs={favoriteGifUrls}
                    />
                  </Suspense>
                </LazyMedia>
              </MediaErrorBoundary>
            )}

            {/* Voice */}
            {hasVoice && <MessageVoice media={media} isMine={isMine} />}

            {/* Audio (mp3) */}
            {hasAudio && <MessageAudio media={media} isMine={isMine} message={message} />}

            {/* Files */}
            {hasFile && <MessageFile media={media} isMine={isMine} />}

            {/* Text */}
            {message.content && !is67Message && (
              <div className="flex items-end gap-2">
                <MessageText content={message.content} isMine={isMine} message={message} onViewProfile={onViewProfile} />
                <span className={`text-[10px] flex-shrink-0 flex items-center gap-0.5 self-end ${isMine ? 'text-white/50' : 'text-zinc-500'}`}>
                  {message.isEdited && <span>{t('edited')}</span>}
                  {message.scheduledAt && <Clock size={11} className="text-amber-400 mr-0.5" />}
                  {message.pending && !message.failed && <Clock size={11} className="opacity-60 animate-pulse" />}
                  {message.failed && (
                    <button
                      onClick={(e) => { e.stopPropagation(); if (message.clientId) retryMessage(message.clientId); }}
                      className="text-red-400 hover:text-red-300 transition-colors p-0.5 -mr-0.5"
                      title={t('retry')}
                    >
                      <RotateCw size={12} />
                    </button>
                  )}
                  {timeStr}
                  {isMine && !message.scheduledAt && !message.pending && !message.failed && (
                    isRead ? <CheckCheck size={13} className="text-sky-300 ml-0.5" /> : <Check size={13} className="ml-0.5" />
                  )}
                </span>
              </div>
            )}

            {/* 67 */}
            {is67Message && (
              <div onClick={open67Modal} className="relative flex items-center justify-center cursor-pointer hover:scale-105 transition-transform overflow-hidden rounded-xl" style={{ width: '200px', height: '150px' }}>
                <img src="/67.gif" alt="67" className="w-full h-full object-cover" />
                <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent" />
                <span className="absolute bottom-2 right-2 text-[10px] flex-shrink-0 flex items-center gap-0.5 text-white/70">
                  {timeStr}
                  {isMine && !message.scheduledAt && (
                    isRead ? <CheckCheck size={13} className="text-sky-300 ml-0.5" /> : <Check size={13} className="ml-0.5" />
                  )}
                </span>
              </div>
            )}

            {/* Time for media-only messages */}
            {!message.content && (hasImage || hasVideo || hasAudio || hasVoice) && (
              <div className={`flex justify-end px-3 py-1 ${hasImage ? '-mt-8 relative z-10' : ''}`}>
                <span className="text-[10px] text-white/70 bg-black/40 px-2 py-0.5 rounded-full flex items-center gap-1 backdrop-blur-sm">
                  {timeStr}
                  {isMine && (
                    isRead ? <CheckCheck size={13} className="text-sky-300" /> : <Check size={13} />
                  )}
                </span>
              </div>
            )}
          </div>

          {/* Reactions */}
          <MessageReactions reactions={message.reactions} messageId={message.id} chatId={message.chatId} />
        </div>

        {/* Avatar (mine) */}
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

        {/* Swipe reply indicator — справа, появляется при свайпе влево */}
        <AnimatePresence>
          {swipeX < 0 && (
            <motion.div
              className={`absolute ${isMine ? 'right-2' : 'right-2'} top-1/2 -translate-y-1/2 pointer-events-none`}
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: Math.abs(swipeX) > 5 ? 1 : 0, scale: Math.abs(swipeX) > 5 ? 1 : 0.8 }}
              exit={{ opacity: 0, scale: 0.8 }}
              transition={{ duration: 0.2 }}
            >
              <div className="relative w-8 h-8">
                <div className="absolute inset-0 rounded-full bg-white/10" />
                <div className="absolute inset-0 rounded-full bg-vortex-500" style={{ transform: `scale(${Math.min(Math.abs(swipeX) / 60, 1)})`, opacity: Math.min(Math.abs(swipeX) / 60, 1) }} />
                {Math.abs(swipeX) >= 60 && (
                  <>
                    {[...Array(6)].map((_, i) => (
                      <motion.div
                        key={i}
                        initial={{ scale: 0, x: 0, y: 0 }}
                        animate={{ scale: [0, 1, 0], x: [0, Math.cos((i * Math.PI) / 3) * 20], y: [0, Math.sin((i * Math.PI) / 3) * 20], opacity: [0, 1, 0] }}
                        transition={{ duration: 0.6, delay: i * 0.05, ease: "easeOut" }}
                        className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-2 h-2 rounded-full bg-vortex-400"
                      />
                    ))}
                  </>
                )}
                <svg className="absolute inset-0 w-8 h-8 -rotate-90">
                  <circle cx="16" cy="16" r="14" fill="none" stroke="currentColor" strokeWidth="2" className="text-vortex-500 transition-all duration-200" strokeDasharray={`${2 * Math.PI * 14}`} strokeDashoffset={`${2 * Math.PI * 14 * (1 - Math.min(Math.abs(swipeX) / 60, 1))}`} style={{ opacity: Math.abs(swipeX) >= 60 ? 0 : 1 }} />
                </svg>
                <div className="absolute inset-0 flex items-center justify-center">
                  <Reply size={16} className="text-white transition-all duration-200" style={{ opacity: Math.min(Math.abs(swipeX) / 30, 1), transform: `scale(${Math.min(Math.abs(swipeX) / 30, 1)}) rotate(${Math.abs(swipeX) >= 60 ? 15 : 0}deg)` }} />
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Context Menu */}
      <MessageContextMenu
        message={message}
        isMine={isMine}
        isPinned={isPinned}
        show={showContext}
        position={contextPos}
        quotedText={quotedText}
        onClose={() => { setShowContext(false); setQuotedText(null); }}
        onReply={handleReply}
        onStartSelectionMode={onStartSelectionMode}
      />

      {/* 67 Modal */}
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
              <div className="absolute inset-0 backdrop-blur-xl bg-black/80" />
              <audio ref={audioRef67} src="/gazan.mp3" loop preload="auto" />
              <motion.div
                initial={{ scale: 0.5, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.5, opacity: 0 }}
                transition={{ duration: 0.5, ease: "easeOut" }}
                className="relative z-10 w-[90vw] h-[90vh] max-w-4xl max-h-[600px]"
                onClick={(e) => e.stopPropagation()}
              >
                <button onClick={close67Modal} className="absolute -top-12 right-0 w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 backdrop-blur-md flex items-center justify-center transition-all z-20">
                  <X size={24} className="text-white" />
                </button>
                <motion.div initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.8 }} className="absolute inset-0 rounded-3xl overflow-hidden">
                  <img src="/maxresdefault.jpg" alt="" className="w-full h-full object-cover opacity-50" />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/60 to-black/40" />
                </motion.div>
                <motion.div initial={{ opacity: 0, scale: 0.5 }} animate={{ opacity: 0.7, scale: 1 }} transition={{ duration: 1, delay: 0.3 }} className="absolute inset-0 rounded-3xl overflow-hidden z-[1]">
                  <img src="/67.gif" alt="" className="w-full h-full object-cover mix-blend-screen" />
                </motion.div>
                <div className="absolute inset-0 bg-gradient-to-r from-purple-500/30 via-pink-500/30 to-purple-500/30 rounded-3xl blur-3xl z-[2] css-pulse-glow" />
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
