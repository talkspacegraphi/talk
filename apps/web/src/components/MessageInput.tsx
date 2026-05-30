import { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Send,
  Paperclip,
  Smile,
  Mic,
  X,
  Reply,
  Pencil,
  Image as ImageIcon,
  FileText,
  Music,
  Clock,
  ChevronLeft,
  ChevronRight,
  Calendar,
  Check,
  Film,
  Play,
  Pause,
  Lock,
} from 'lucide-react';
import { useChatStore } from '../stores/chatStore';
import { useAuthStore } from '../stores/authStore';
import { api } from '../lib/api';
import { getSocket } from '../lib/socket';
import { useLang } from '../lib/i18n';
import { AUDIO_EXTENSIONS, MAX_FILE_SIZE } from '../lib/types';
import EmojiPicker from './EmojiPicker';
import GifPicker from './GifPicker';

interface Attachment {
  file: File;
  preview?: string;
  type: 'image' | 'video' | 'file' | 'audio';
}

interface MessageInputProps {
  chatId: string;
  isBlocked?: boolean;
  blockedByOther?: boolean;
  onUnblock?: () => void;
}

export default function MessageInput({ chatId, isBlocked, blockedByOther, onUnblock }: MessageInputProps) {
  const { user } = useAuthStore();
  const { t } = useLang();
  const { replyTo, editingMessage, setReplyTo, setEditingMessage, getDraft, setDraft, chats } = useChatStore();
  const [text, setText] = useState(() => getDraft(chatId));

  // Get current chat members for @mentions
  const chat = chats.find(c => c.id === chatId);
  const isGroup = chat?.type === 'group';
  const chatMembers = (chat?.members || []).filter((m) => m.user.id !== user?.id);
  const [showEmoji, setShowEmoji] = useState(false);
  const [showGif, setShowGif] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [showAttachMenu, setShowAttachMenu] = useState(false);
  const [attachment, setAttachment] = useState<Attachment | null>(null);
  const [isSending, setIsSending] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [formatMenu, setFormatMenu] = useState<{ show: boolean; x: number; y: number }>({ show: false, x: 0, y: 0 });
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [mentionIndex, setMentionIndex] = useState(0);
  const [showSchedule, setShowSchedule] = useState(false);
  const [scheduleDate, setScheduleDate] = useState('');
  const [scheduleStep, setScheduleStep] = useState<'presets' | 'custom'>('presets');
  const [scheduleHour, setScheduleHour] = useState('12');
  const [scheduleMinute, setScheduleMinute] = useState('00');
  const [scheduleCalDate, setScheduleCalDate] = useState(''); // YYYY-MM-DD
  const [scheduleCalMonth, setScheduleCalMonth] = useState(new Date().getMonth());
  const [scheduleCalYear, setScheduleCalYear] = useState(new Date().getFullYear());
  const [scheduleToast, setScheduleToast] = useState<string | null>(null);

  // Voice recording states
  const [isRecordingLocked, setIsRecordingLocked] = useState(false);
  const [recordingPaused, setRecordingPaused] = useState(false);
  const [touchStartY, setTouchStartY] = useState<number | null>(null);
  const [slideOffset, setSlideOffset] = useState(0);
  const [isMobile, setIsMobile] = useState(false);

  // Detect mobile
  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth <= 768);
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // Filtered members for @mention
  const filteredMembers = mentionQuery !== null && isGroup
    ? chatMembers.filter((m) => {
        const q = mentionQuery.toLowerCase();
        return m.user.displayName.toLowerCase().includes(q) || m.user.username.toLowerCase().includes(q);
      }).slice(0, 6)
    : [];

  const insertMention = (member: { user: { username: string } }) => {
    const el = inputRef.current;
    if (!el) return;
    const cursorPos = el.selectionStart;
    const before = text.substring(0, cursorPos);
    const after = text.substring(cursorPos);
    // Find the @ that started this mention
    const atIdx = before.lastIndexOf('@');
    if (atIdx === -1) return;
    const newText = before.substring(0, atIdx) + `@${member.user.username} ` + after;
    setText(newText);
    setDraft(chatId, newText);
    setMentionQuery(null);
    setMentionIndex(0);
    setTimeout(() => {
      el.focus();
      const newPos = atIdx + member.user.username.length + 2;
      el.setSelectionRange(newPos, newPos);
    }, 0);
  };

  const inputRef = useRef<HTMLTextAreaElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval>>(undefined);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const animFrameRef = useRef<number>(0);
  const recordingTimeRef = useRef<number>(0);
  const streamRef = useRef<MediaStream | null>(null);
  const [liveBars, setLiveBars] = useState<number[]>(() => Array(32).fill(5));

  // Cleanup recording resources on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
      if (audioContextRef.current) audioContextRef.current.close().catch(() => {});
      if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop());
      if (mediaRecorderRef.current?.state === 'recording') {
        mediaRecorderRef.current.stop();
      }
    };
  }, []);

  // Автоподгон высоты textarea
  useEffect(() => {
    const el = inputRef.current;
    if (el) {
      el.style.height = 'auto';
      el.style.height = Math.min(el.scrollHeight, 150) + 'px';
    }
  }, [text]);

  // При редактировании — заполнить текст
  useEffect(() => {
    if (editingMessage?.content) {
      setText(editingMessage.content);
      inputRef.current?.focus();
    }
  }, [editingMessage]);

  // Load draft when switching chats
  useEffect(() => {
    if (!editingMessage) {
      setText(getDraft(chatId));
    }
  }, [chatId]);

  // Handle paste images (Ctrl+V) — support up to 5 images
  useEffect(() => {
    const handlePaste = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;

      const imageFiles: File[] = [];
      for (let i = 0; i < items.length && imageFiles.length < 5; i++) {
        const item = items[i];
        if (item.type.startsWith('image/')) {
          const file = item.getAsFile();
          if (file) {
            if (file.size > MAX_FILE_SIZE) {
              alert(t('fileTooLarge'));
              continue;
            }
            imageFiles.push(file);
          }
        }
      }

      if (imageFiles.length > 0) {
        e.preventDefault();
        const newAttachments: Attachment[] = imageFiles.map(file => ({
          file,
          preview: URL.createObjectURL(file),
          type: 'image',
        }));
        setAttachments(prev => [...prev, ...newAttachments].slice(0, 5));
        inputRef.current?.focus();
      }
    };

    document.addEventListener('paste', handlePaste);
    return () => document.removeEventListener('paste', handlePaste);
  }, [t]);

  // Cleanup preview URLs
  useEffect(() => {
    return () => {
      if (attachment?.preview) URL.revokeObjectURL(attachment.preview);
    };
  }, [attachment]);

  // Typing events
  const emitTyping = useCallback(() => {
    const socket = getSocket();
    if (!socket) return;
    socket.emit('typing_start', chatId);

    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(() => {
      socket.emit('typing_stop', chatId);
    }, 2000);
  }, [chatId]);

  const handleSend = async (scheduledAt?: string) => {
    const trimmed = text.trim();
    const hasAttachment = !!attachment || attachments.length > 0;

    if (!trimmed && !hasAttachment) return;
    if (isSending) return;

    const socket = getSocket();
    if (!socket) return;

    // Остановить typing
    socket.emit('typing_stop', chatId);
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);

    if (editingMessage) {
      socket.emit('edit_message', {
        messageId: editingMessage.id,
        content: trimmed,
        chatId,
      });
      setEditingMessage(null);
      setText('');
      setDraft(chatId, '');
      return;
    }

    if (attachments.length > 0) {
      setIsSending(true);
      try {
        // Upload all files in parallel
        const uploadResults = await Promise.all(attachments.map(att => api.uploadFile(att.file)));
        // Determine if we have audio (for voice type) or use first attachment type
        const hasAudio = attachments.some(a => a.type === 'audio');
        const messageType = hasAudio ? 'voice' : attachments[0].type;
        // Send single message with media array
        socket.emit('send_message', {
          chatId,
          content: trimmed || null,
          type: messageType,
          media: uploadResults.map((result, i) => ({
            url: result.url,
            type: attachments[i].type === 'audio' ? 'voice' : attachments[i].type,
            filename: result.filename,
            size: result.size,
          })),
          replyToId: replyTo?.id || null,
          quote: replyTo?.quote || null,
          ...(scheduledAt ? { scheduledAt } : {}),
        });
        setReplyTo(null);
        clearAllAttachments();
      } catch (e) {
        console.error('Ошибка загрузки файлов:', e);
      } finally {
        setIsSending(false);
      }
    } else if (attachment) {
      setIsSending(true);
      try {
        const result = await api.uploadFile(attachment.file);
        const isAudioType = attachment.type === 'audio';
        socket.emit('send_message', {
          chatId,
          content: trimmed || null,
          type: isAudioType ? 'voice' : attachment.type,
          mediaUrl: result.url,
          mediaType: isAudioType ? 'voice' : attachment.type,
          fileName: result.filename,
          fileSize: result.size,
          replyToId: replyTo?.id || null,
          quote: replyTo?.quote || null,
          ...(scheduledAt ? { scheduledAt } : {}),
        });
        setReplyTo(null);
        clearAttachment();
      } catch (e) {
        console.error('Ошибка загрузки файла:', e);
      } finally {
        setIsSending(false);
      }
    } else {
      // Проверяем является ли текст ссылкой на гифку
      const gifUrlPattern = /^https?:\/\/.+\.(gif|gifv)(\?.*)?$/i;
      const gifSitePattern = /^https?:\/\/(giphy\.com|tenor\.com|gfycat\.com|klipy\.com|imgur\.com)\/.+/i;

      const isGifUrl = gifUrlPattern.test(trimmed) || gifSitePattern.test(trimmed);

      if (isGifUrl) {
        // Отправляем как изображение/гифку
        socket.emit('send_message', {
          chatId,
          content: null,
          type: 'image',
          mediaUrl: trimmed,
          mediaType: 'image',
          fileName: 'gif.gif',
          replyToId: replyTo?.id || null,
          quote: replyTo?.quote || null,
          ...(scheduledAt ? { scheduledAt } : {}),
        });
      } else {
        // Обычное текстовое сообщение
        socket.emit('send_message', {
          chatId,
          content: trimmed,
          type: 'text',
          replyToId: replyTo?.id || null,
          quote: replyTo?.quote || null,
          ...(scheduledAt ? { scheduledAt } : {}),
        });
      }
      setReplyTo(null);
    }

    setText('');
    setDraft(chatId, '');
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    // Handle @mention navigation
    if (mentionQuery !== null && filteredMembers.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setMentionIndex(i => (i + 1) % filteredMembers.length);
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setMentionIndex(i => (i - 1 + filteredMembers.length) % filteredMembers.length);
        return;
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        insertMention(filteredMembers[mentionIndex]);
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        setMentionQuery(null);
        return;
      }
    }
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const clearAttachment = () => {
    if (attachment?.preview) URL.revokeObjectURL(attachment.preview);
    setAttachment(null);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > MAX_FILE_SIZE) {
        alert(t('fileTooLarge'));
        e.target.value = '';
        return;
      }
      const isAudio = file.type.startsWith('audio/') || AUDIO_EXTENSIONS.some(ext => file.name.toLowerCase().endsWith(ext));
      const isVideo = file.type.startsWith('video/');
      const type: Attachment['type'] = isAudio ? 'audio' : isVideo ? 'video' : 'file';
      setAttachment({ file, type });
      inputRef.current?.focus();
    }
    e.target.value = '';
    setShowAttachMenu(false);
  };

  const [attachments, setAttachments] = useState<Attachment[]>([]);

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length > 0) {
      const newAttachments: Attachment[] = files.slice(0, 5).map(file => {
        const isVideo = file.type.startsWith('video/');
        const isAudio = file.type.startsWith('audio/') || AUDIO_EXTENSIONS.some(ext => file.name.toLowerCase().endsWith(ext));
        const preview = !isVideo && !isAudio && file.type.startsWith('image/') ? URL.createObjectURL(file) : undefined;
        return { file, preview, type: isVideo ? 'video' : isAudio ? 'audio' : 'image' };
      });
      setAttachments(prev => [...prev, ...newAttachments].slice(0, 5));
      inputRef.current?.focus();
    }
    e.target.value = '';
    setShowAttachMenu(false);
  };

  const removeAttachment = (index: number) => {
    setAttachments(prev => {
      const item = prev[index];
      if (item?.preview) URL.revokeObjectURL(item.preview);
      return prev.filter((_, i) => i !== index);
    });
  };

  const clearAllAttachments = () => {
    attachments.forEach(a => { if (a.preview) URL.revokeObjectURL(a.preview); });
    setAttachments([]);
  };

  const isElectron = typeof window !== 'undefined' && !!(window as any).electronAPI;

  // Запись голосового
  const startRecording = async (lockImmediately = false) => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      // Use ogg/opus for better compatibility, fallback to webm
      const mimeType = MediaRecorder.isTypeSupported('audio/ogg;codecs=opus')
        ? 'audio/ogg;codecs=opus'
        : MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
          ? 'audio/webm;codecs=opus'
          : 'audio/webm';
      const ext = mimeType.includes('ogg') ? 'ogg' : 'webm';
      const recorder = new MediaRecorder(stream, { mimeType });
      mediaRecorderRef.current = recorder;
      chunksRef.current = [];

      // Set up AnalyserNode for live waveform (skip in Electron - causes crashes)
      if (!isElectron) {
        try {
          const actx = new AudioContext();
          const source = actx.createMediaStreamSource(stream);
          const analyser = actx.createAnalyser();
          analyser.fftSize = 256;
          analyser.smoothingTimeConstant = 0.6;
          source.connect(analyser);
          audioContextRef.current = actx;
          analyserRef.current = analyser;

          const timeDomainData = new Uint8Array(analyser.frequencyBinCount);
          const updateBars = () => {
            if (!analyserRef.current) return;
            analyserRef.current.getByteTimeDomainData(timeDomainData);
            const bars: number[] = [];
            const step = Math.floor(timeDomainData.length / 32);
            for (let i = 0; i < 32; i++) {
              let sum = 0;
              for (let j = 0; j < step; j++) {
                const val = Math.abs(timeDomainData[i * step + j] - 128);
                sum += val;
              }
              const avg = sum / step;
              bars.push(Math.max(8, Math.min(100, avg * 1.8 + 8)));
            }
            setLiveBars(bars);
            animFrameRef.current = requestAnimationFrame(updateBars);
          };
          animFrameRef.current = requestAnimationFrame(updateBars);
        } catch (e) {
          console.warn('AudioContext not available:', e);
        }
      }

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      recorder.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
        const blob = new Blob(chunksRef.current, { type: mimeType });
        const file = new File([blob], `voice.${ext}`, { type: mimeType });

        try {
          const result = await api.uploadFile(file);
          const socket = getSocket();
          if (socket) {
            socket.emit('send_message', {
              chatId,
              content: null,
              type: 'voice',
              mediaUrl: result.url,
              mediaType: 'voice',
              fileName: result.filename,
              fileSize: result.size,
              duration: recordingTimeRef.current,
              replyToId: replyTo?.id || null,
            });
            setReplyTo(null);
          }
        } catch (e) {
          console.error('Ошибка отправки голосового:', e);
        }
      };

      recorder.start();
      setIsRecording(true);
      setRecordingTime(0);
      recordingTimeRef.current = 0;
      timerRef.current = setInterval(() => {
        recordingTimeRef.current += 1;
        setRecordingTime((t) => t + 1);
      }, 1000);

      // Lock immediately for desktop
      if (lockImmediately) {
        setIsRecordingLocked(true);
      }
    } catch (e) {
      console.error('Ошибка записи:', e);
    }
  };

  const cleanupAnalyser = () => {
    if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    analyserRef.current = null;
    if (audioContextRef.current) {
      audioContextRef.current.close().catch(() => {});
      audioContextRef.current = null;
    }
    setLiveBars(Array(32).fill(5));
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current?.state === 'recording') {
      mediaRecorderRef.current.stop();
    }
    if (timerRef.current) clearInterval(timerRef.current);
    cleanupAnalyser();
    setIsRecording(false);
    setIsRecordingLocked(false);
    setRecordingPaused(false);
    setRecordingTime(0);
    setSlideOffset(0);
    // recordingTimeRef is consumed in onstop, don't reset here
  };

  const cancelRecording = () => {
    if (mediaRecorderRef.current?.state === 'recording') {
      mediaRecorderRef.current.ondataavailable = null;
      mediaRecorderRef.current.onstop = null;
      mediaRecorderRef.current.stop();
      mediaRecorderRef.current.stream?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (timerRef.current) clearInterval(timerRef.current);
    cleanupAnalyser();
    setIsRecording(false);
    setIsRecordingLocked(false);
    setRecordingPaused(false);
    setRecordingTime(0);
    setSlideOffset(0);
    recordingTimeRef.current = 0;
  };

  const togglePauseRecording = () => {
    if (!mediaRecorderRef.current) return;
    if (recordingPaused) {
      mediaRecorderRef.current.resume();
      setRecordingPaused(false);
      timerRef.current = setInterval(() => {
        recordingTimeRef.current += 1;
        setRecordingTime((t) => t + 1);
      }, 1000);
    } else {
      mediaRecorderRef.current.pause();
      setRecordingPaused(true);
      if (timerRef.current) clearInterval(timerRef.current);
    }
  };

  // Touch handlers for mic button
  const handleMicTouchStart = (e: React.TouchEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const touch = e.touches[0];
    setTouchStartY(touch.clientY);
    startRecording(false);
  };

  const handleMicTouchMove = (e: React.TouchEvent) => {
    if (!isRecording || isRecordingLocked || touchStartY === null) return;
    e.preventDefault();
    e.stopPropagation();
    const touch = e.touches[0];
    const deltaY = touchStartY - touch.clientY;
    const offset = Math.max(0, deltaY);
    setSlideOffset(offset);

    // Lock when slid up 100px
    if (offset > 100) {
      setIsRecordingLocked(true);
      setSlideOffset(0);
      setTouchStartY(null);
    }
  };

  const handleMicTouchEnd = (e: React.TouchEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setTouchStartY(null);
    setSlideOffset(0);

    // If not locked, send immediately
    if (isRecording && !isRecordingLocked) {
      stopRecording();
    }
  };

  const formatTime = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  const handleInputContextMenu = (e: React.MouseEvent) => {
    const el = inputRef.current;
    if (el && el.selectionStart !== el.selectionEnd) {
      e.preventDefault();
      setFormatMenu({ show: true, x: e.clientX, y: e.clientY });
    }
  };

  const applyFormat = (prefix: string, suffix: string) => {
    const el = inputRef.current;
    if (!el) return;
    const start = el.selectionStart;
    const end = el.selectionEnd;
    const val = el.value;
    const selected = val.substring(start, end);
    const newVal = val.substring(0, start) + prefix + selected + suffix + val.substring(end);
    setText(newVal);
    setFormatMenu({ show: false, x: 0, y: 0 });

    // refocus and update cursor
    setTimeout(() => {
      el.focus();
      el.setSelectionRange(start + prefix.length, end + prefix.length);
    }, 0);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const file = e.dataTransfer.files[0];
      const isVideo = file.type.startsWith('video/');
      const isImage = file.type.startsWith('image/');
      const audioExts = ['.mp3', '.wav', '.ogg', '.m4a', '.aac', '.flac', '.wma', '.opus'];
      const isAudio = file.type.startsWith('audio/') || audioExts.some(ext => file.name.toLowerCase().endsWith(ext));

      const type = isImage ? 'image' : isVideo ? 'video' : isAudio ? 'audio' : 'file';
      const preview = isImage ? URL.createObjectURL(file) : undefined;

      setAttachment({ file, type, preview });
      inputRef.current?.focus();
    }
  };

  const hasMediaAttachment = !!attachment || attachments.length > 0;
  const hasContent = text.trim() || hasMediaAttachment;

  return (
    <div
      className="z-10 px-6 pt-2 pb-6 flex-shrink-0 bg-transparent relative"
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* Blocked state - show unblock button */}
      {isBlocked && onUnblock && (
        <div className="max-w-3xl mx-auto">
          <button
            onClick={onUnblock}
            className="w-full py-3 px-4 bg-white/[0.04] backdrop-blur-2xl border border-white/10 rounded-2xl text-zinc-400 hover:text-white hover:bg-white/[0.06] transition-all flex items-center justify-center gap-2"
          >
            {t('unblockUser')}
          </button>
        </div>
      )}

      {/* Blocked by other - show message */}
      {blockedByOther && !isBlocked && (
        <div className="max-w-3xl mx-auto">
          <div className="w-full py-3 px-4 bg-white/[0.04] backdrop-blur-2xl border border-white/10 rounded-2xl text-zinc-500 text-center">
            {t('userBlocked')}
          </div>
        </div>
      )}

      {/* Normal input - only show if not blocked */}
      {!isBlocked && !blockedByOther && (
        <>
      {/* Drag overlay */}
      <AnimatePresence>
        {isDragging && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 z-50 rounded-[2rem] mx-6 mb-6 mt-2 bg-vortex-500/10 border-2 border-dashed border-vortex-400 backdrop-blur-sm flex items-center justify-center pointer-events-none"
          >
            <div className="flex flex-col items-center gap-2 text-vortex-300">
              <FileText size={32} className="animate-bounce" />
              <p className="font-semibold">{t('dropFileHere')}</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Reply / Edit indicator */}
      <AnimatePresence>
        {(replyTo || editingMessage) && (
          <motion.div
            initial={{ height: 0, opacity: 0, y: 10, scale: 0.95 }}
            animate={{ height: 'auto', opacity: 1, y: 0, scale: 1 }}
            exit={{ height: 0, opacity: 0, y: 10, scale: 0.95 }}
            className="mb-2 max-w-3xl mx-auto overflow-hidden px-1.5"
          >
            <div className="flex items-center gap-3 px-4 py-2.5 bg-white/[0.04] backdrop-blur-2xl border border-white/10 rounded-2xl relative shadow-xl">
              <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-3/5 bg-gradient-to-b from-vortex-400 to-purple-500 rounded-r-md" />
              <div className="w-6 h-6 rounded-full bg-white/5 flex items-center justify-center flex-shrink-0">
                {editingMessage ? (
                  <Pencil size={12} className="text-vortex-400" />
                ) : (
                  <Reply size={12} className="text-vortex-400" />
                )}
              </div>
              <div className="flex-1 min-w-0 flex flex-col justify-center">
                <p className="text-xs font-semibold text-vortex-400 mb-0.5">
                  {editingMessage
                    ? t('editing')
                    : `${t('replyTo')} ${replyTo?.sender?.displayName || replyTo?.sender?.username || ''}`}
                </p>
                <div className="text-xs text-zinc-300 truncate opacity-80 border-l border-white/20 pl-2 ml-1">
                  {replyTo?.quote ? `«${replyTo.quote}»` : (editingMessage || replyTo)?.content || t('media') || 'Медиа'}
                </div>
              </div>
              <button
                onClick={() => {
                  setReplyTo(null);
                  setEditingMessage(null);
                  setText('');
                }}
                className="w-7 h-7 rounded-full flex items-center justify-center text-white/40 hover:text-white hover:bg-white/10 transition-colors"
              >
                <X size={14} />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Attachment previews */}
      <AnimatePresence>
        {attachments.length > 0 && (
          <motion.div
            initial={{ height: 0, opacity: 0, y: 10 }}
            animate={{ height: 'auto', opacity: 1, y: 0 }}
            exit={{ height: 0, opacity: 0, y: 10 }}
            className="mb-2 max-w-3xl mx-auto px-1.5"
          >
            <div className="flex gap-2 overflow-x-auto pb-2">
              {attachments.map((att, i) => (
                <div key={i} className="relative flex-shrink-0 w-24 h-24 rounded-xl bg-white/[0.04] border border-white/10 overflow-hidden group">
                  {att.preview ? (
                    <img src={att.preview} alt="" className="w-full h-full object-cover" />
                  ) : att.type === 'video' ? (
                    <div className="w-full h-full flex items-center justify-center bg-vortex-500/20">
                      <Film size={24} className="text-vortex-400" />
                    </div>
                  ) : att.type === 'audio' ? (
                    <div className="w-full h-full flex items-center justify-center bg-emerald-500/20">
                      <Music size={24} className="text-emerald-400" />
                    </div>
                  ) : (
                    <div className="w-full h-full flex items-center justify-center bg-sky-500/20">
                      <FileText size={24} className="text-sky-400" />
                    </div>
                  )}
                  <button
                    onClick={() => removeAttachment(i)}
                    className="absolute top-1 right-1 w-6 h-6 rounded-full bg-black/60 flex items-center justify-center text-white/80 hover:text-white hover:bg-black/80 transition-colors"
                  >
                    <X size={12} />
                  </button>
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Single attachment preview (legacy) */}
      <AnimatePresence>
        {attachment && (
          <motion.div
            initial={{ height: 0, opacity: 0, y: 10, scale: 0.95 }}
            animate={{ height: 'auto', opacity: 1, y: 0, scale: 1 }}
            exit={{ height: 0, opacity: 0, y: 10, scale: 0.95 }}
            className="mb-2 max-w-3xl mx-auto overflow-hidden px-1.5"
          >
            <div className="flex items-center gap-3 px-3 py-2.5 bg-white/[0.04] backdrop-blur-2xl border border-white/10 rounded-2xl shadow-xl relative">
              <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-3/5 bg-gradient-to-b from-sky-400 to-blue-500 rounded-r-md" />
              {attachment.preview ? (
                <img
                  src={attachment.preview}
                  alt=""
                  className="w-12 h-12 rounded-xl object-cover flex-shrink-0 ring-1 ring-white/10 ml-2"
                />
              ) : attachment.type === 'video' ? (
                <div className="w-12 h-12 rounded-xl bg-vortex-500/20 flex items-center justify-center flex-shrink-0 ring-1 ring-white/10 ml-2">
                  <ImageIcon size={20} className="text-vortex-400" />
                </div>
              ) : attachment.type === 'audio' ? (
                <div className="w-12 h-12 rounded-xl bg-emerald-500/20 flex items-center justify-center flex-shrink-0 ring-1 ring-white/10 ml-2">
                  <Music size={20} className="text-emerald-400" />
                </div>
              ) : (
                <div className="w-12 h-12 rounded-xl bg-sky-500/20 flex items-center justify-center flex-shrink-0 ring-1 ring-white/10 ml-2">
                  <FileText size={20} className="text-sky-400" />
                </div>
              )}
              <div className="flex-1 min-w-0 flex flex-col justify-center">
                <p className="text-sm font-medium text-white truncate tracking-wide">{attachment.file.name}</p>
                <p className="text-xs text-zinc-400 font-mono mt-0.5">
                  {(attachment.file.size / 1024).toFixed(1)} {t('kb')}
                  {isSending && <span className="ml-2 text-vortex-400 animate-pulse">{t('sending')}</span>}
                </p>
              </div>
              <button
                onClick={clearAttachment}
                className="w-8 h-8 rounded-full flex items-center justify-center text-white/40 hover:text-white hover:bg-white/10 transition-colors"
              >
                <X size={16} />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Recording UI */}
      <AnimatePresence mode="wait">
      {isRecording ? (
        isRecordingLocked ? (
          // Locked recording UI (mobile)
          <motion.div
            key="locked-recording"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            className="flex flex-col items-center gap-4 w-full max-w-3xl mx-auto"
          >
            {/* Pause button above */}
            <button
              onClick={togglePauseRecording}
              className="w-12 h-12 rounded-full flex items-center justify-center bg-white/10 hover:bg-white/20 transition-all active:scale-95 shadow-lg"
            >
              {recordingPaused ? (
                <Play size={20} className="text-white ml-0.5" fill="currentColor" />
              ) : (
                <div className="flex gap-1">
                  <div className="w-1 h-4 bg-white rounded-full" />
                  <div className="w-1 h-4 bg-white rounded-full" />
                </div>
              )}
            </button>

            {/* Main recording bar */}
            <div className="flex items-center gap-3 w-full bg-gradient-to-r from-red-500/10 via-red-500/5 to-transparent backdrop-blur-xl rounded-[2rem] border border-red-500/30 p-4 shadow-[0_8px_32px_rgba(239,68,68,0.2)]">
              {/* Cancel button */}
              <button
                onClick={cancelRecording}
                className="w-12 h-12 rounded-full flex items-center justify-center text-white bg-red-500/20 hover:bg-red-500/30 transition-all active:scale-95 shadow-lg flex-shrink-0"
              >
                <X size={22} strokeWidth={2.5} />
              </button>

              {/* Center: animated circle + time */}
              <div className="flex-1 flex items-center justify-center gap-3">
                <div className="relative">
                  <div className="w-12 h-12 rounded-full bg-red-500/20 flex items-center justify-center">
                    <div className="w-3 h-3 rounded-full bg-red-500 animate-pulse shadow-[0_0_12px_rgba(239,68,68,0.8)]" />
                  </div>
                  <motion.div
                    className="absolute inset-0 rounded-full border-2 border-red-500"
                    animate={{ scale: [1, 1.3, 1], opacity: [0.8, 0, 0.8] }}
                    transition={{ duration: 2, repeat: Infinity }}
                  />
                </div>
                <span className="text-xl font-mono font-bold text-white tracking-wider">
                  {formatTime(recordingTime)}
                </span>
              </div>

              {/* Send button */}
              <button
                onClick={stopRecording}
                className="w-12 h-12 rounded-full flex items-center justify-center bg-gradient-to-br from-vortex-500 to-vortex-600 hover:from-vortex-600 hover:to-vortex-700 transition-all text-white active:scale-95 shadow-[0_4px_20px_rgba(99,102,241,0.5)] flex-shrink-0"
              >
                <Send size={20} strokeWidth={2.5} className="translate-x-[1px]" />
              </button>
            </div>
          </motion.div>
        ) : (
          // Unlocked recording UI (hold to record)
          <motion.div
            key="unlocked-recording"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1, y: -slideOffset }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="flex items-center gap-2 md:gap-3 bg-gradient-to-r from-red-500/10 via-red-500/5 to-transparent backdrop-blur-xl rounded-[2rem] border border-red-500/30 p-3 md:p-4 w-full max-w-3xl mx-auto shadow-[0_8px_32px_rgba(239,68,68,0.2)] relative"
          >
            {/* Lock indicator (shows when sliding up) */}
            {slideOffset > 20 && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="absolute -top-16 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2"
              >
                <div className={`w-10 h-10 rounded-full flex items-center justify-center transition-colors ${
                  slideOffset > 100 ? 'bg-green-500/20' : 'bg-white/10'
                }`}>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" className={slideOffset > 100 ? 'text-green-400' : 'text-white'}>
                    <path d="M12 2C9.243 2 7 4.243 7 7v3H6c-1.103 0-2 .897-2 2v8c0 1.103.897 2 2 2h12c1.103 0 2-.897 2-2v-8c0-1.103-.897-2-2-2h-1V7c0-2.757-2.243-5-5-5zm3 8V7c0-1.654-1.346-3-3-3S9 5.346 9 7v3h6z" fill="currentColor"/>
                  </svg>
                </div>
                <span className="text-xs text-white/80 font-medium">
                  {slideOffset > 100 ? 'Отпустите' : 'Потяните вверх'}
                </span>
              </motion.div>
            )}

            <div className="flex-1 flex items-center gap-2 md:gap-3 min-w-0">
              <div className="flex items-center gap-2 flex-shrink-0">
                <span className="w-3 h-3 rounded-full bg-red-500 animate-pulse shadow-[0_0_8px_rgba(239,68,68,0.6)]" />
                <span className="text-base md:text-lg text-white font-mono font-semibold tracking-wider">{formatTime(recordingTime)}</span>
              </div>
              <div className="flex-1 flex items-center gap-[2px] md:gap-1 h-8 md:h-10 bg-black/20 rounded-full px-2 md:px-3 min-w-0">
                {liveBars.map((h, i) => (
                  <div
                    key={i}
                    className="flex-1 bg-gradient-to-t from-red-500 to-red-400 rounded-full transition-all duration-100 shadow-sm"
                    style={{ height: `${h}%`, minWidth: '2px' }}
                  />
                ))}
              </div>
            </div>
            <span className="text-sm text-white/60 flex-shrink-0 hidden md:block">← Отпустите для отправки</span>
          </motion.div>
        )
      ) : (
        <div key="input-bar" className="flex items-end gap-1.5 bg-white/[0.04] backdrop-blur-[40px] rounded-[2rem] border border-white/[0.08] p-2 w-full max-w-3xl mx-auto transition-all duration-300 hover:bg-white/[0.06] focus-within:bg-white/[0.08] shadow-[0_8px_32px_rgba(0,0,0,0.3)] focus-within:shadow-[0_8px_40px_rgba(99,102,241,0.15)] focus-within:border-vortex-500/30 group">
          {/* Attach */}
          <div className="relative mb-0.5 ml-1 flex-shrink-0 self-center">
            <button
              onClick={() => setShowAttachMenu(!showAttachMenu)}
              className="p-2 rounded-full text-white/50 hover:text-white hover:bg-white/10 transition-colors group-focus-within:text-white/70"
            >
              <Paperclip size={20} />
            </button>
            <AnimatePresence>
              {showAttachMenu && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setShowAttachMenu(false)} />
                  <motion.div
                    initial={{ opacity: 0, scale: 0.95, y: 15 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95, y: 15 }}
                    className="absolute bottom-[calc(100%+12px)] left-0 w-52 rounded-[1.5rem] glass-strong shadow-2xl z-50 p-2 border border-white/10 backdrop-blur-3xl"
                  >
                    <button
                      onClick={() => imageInputRef.current?.click()}
                      className="flex items-center gap-4 w-full px-3 py-3 rounded-xl text-sm font-medium text-zinc-200 hover:bg-white/5 hover:text-white transition-all group"
                    >
                      <div className="w-10 h-10 rounded-full bg-gradient-to-br from-vortex-400/20 to-purple-500/20 flex items-center justify-center ring-1 ring-vortex-400/30 group-hover:scale-110 transition-transform shadow-inner">
                        <ImageIcon size={18} className="text-vortex-400" />
                      </div>
                      {t('photoVideo')}
                    </button>
                    <button
                      onClick={() => fileInputRef.current?.click()}
                      className="flex items-center gap-4 w-full px-3 py-3 rounded-xl text-sm font-medium text-zinc-200 hover:bg-white/5 hover:text-white transition-all group mt-1"
                    >
                      <div className="w-10 h-10 rounded-full bg-gradient-to-br from-emerald-400/20 to-teal-500/20 flex items-center justify-center ring-1 ring-emerald-400/30 group-hover:scale-110 transition-transform shadow-inner">
                        <FileText size={18} className="text-emerald-400" />
                      </div>
                      {t('file')}
                    </button>
                  </motion.div>
                </>
              )}
            </AnimatePresence>

<input
              ref={fileInputRef}
              type="file"
              className="hidden"
              onChange={handleFileChange}
            />
            <input
              ref={imageInputRef}
              type="file"
              className="hidden"
              onChange={handleImageChange}
              accept="image/*,video/*,audio/*,.mp3,.wav,.ogg,.m4a,.aac,.flac"
            />
          </div>

          {/* Input */}
          <div className="flex-1 relative align-middle self-center">
            {/* @Mention popup */}
            <AnimatePresence>
              {mentionQuery !== null && filteredMembers.length > 0 && (
                <motion.div
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 8 }}
                  className="absolute bottom-full left-0 right-0 mb-2 rounded-xl glass-strong shadow-2xl border border-white/10 py-1 z-50 max-h-48 overflow-y-auto"
                >
                  {filteredMembers.map((m, i) => (
                    <button
                      key={m.user.id}
                      onClick={() => insertMention(m)}
                      className={`flex items-center gap-3 w-full px-3 py-2 text-left transition-colors ${
                        i === mentionIndex ? 'bg-accent/20 text-white' : 'text-zinc-300 hover:bg-white/5'
                      }`}
                    >
                      {m.user.avatar ? (
                        <img src={m.user.avatar} className="w-7 h-7 rounded-full object-cover" alt="" />
                      ) : (
                        <div className="w-7 h-7 rounded-full bg-gradient-to-br from-vortex-500 to-purple-600 flex items-center justify-center text-white text-xs font-semibold">
                          {(m.user.displayName || m.user.username)[0]?.toUpperCase()}
                        </div>
                      )}
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">{m.user.displayName || m.user.username}</p>
                        <p className="text-xs text-zinc-500 truncate">@{m.user.username}</p>
                      </div>
                    </button>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>
            <textarea
              ref={inputRef}
              value={text}
              onChange={(e) => {
                const val = e.target.value;
                setText(val);
                setDraft(chatId, val);
                emitTyping();
                // Detect @mention
                if (isGroup) {
                  const cursorPos = e.target.selectionStart;
                  const before = val.substring(0, cursorPos);
                  const match = before.match(/@(\w*)$/);
                  if (match) {
                    setMentionQuery(match[1]);
                    setMentionIndex(0);
                  } else {
                    setMentionQuery(null);
                  }
                }
              }}
              onKeyDown={handleKeyDown}
              onContextMenu={handleInputContextMenu}
              placeholder={attachment ? t('addCaption') : t('message')}
              rows={1}
              className="w-full resize-none bg-transparent text-[15px] text-white placeholder-white/40 leading-relaxed py-2.5 px-2 border-none focus:ring-0 max-h-[150px] outline-none"
            />
          </div>

          {/* Emoji */}
          <div className="relative mb-0.5 flex-shrink-0 self-center">
            <button
              onClick={() => setShowEmoji(!showEmoji)}
              className="p-2 rounded-full text-white/50 hover:text-white hover:bg-white/10 transition-colors"
            >
              <Smile size={20} />
            </button>
            <AnimatePresence>
              {showEmoji && (
                <div className="fixed inset-x-0 bottom-0 z-50 md:absolute md:inset-x-auto md:right-0 md:bottom-auto md:top-[calc(100%+12px)]">
                  <EmojiPicker
                    onSelect={(emoji) => {
                      setText((prev) => {
                        const next = prev + emoji;
                        setDraft(chatId, next);
                        return next;
                      });
                      inputRef.current?.focus();
                    }}
                    onSelectGif={(gifUrl) => {
                      const socket = getSocket();
                      if (socket) {
                        socket.emit('send_message', {
                          chatId,
                          content: null,
                          type: 'image',
                          mediaUrl: gifUrl,
                          mediaType: 'image',
                          fileName: 'gif',
                          replyToId: replyTo?.id || null,
                        });
                        setReplyTo(null);
                      }
                      setShowEmoji(false);
                    }}
                    onClose={() => setShowEmoji(false)}
                  />
                </div>
              )}
            </AnimatePresence>
          </div>

          {/* Send / Mic */}
          <div className="flex-shrink-0 self-center mr-0.5 relative">
            {hasContent ? (
              <>
                <button
                  onClick={() => handleSend()}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    setScheduleStep('presets');
                    setShowSchedule(true);
                  }}
                  disabled={isSending}
                  className="w-10 h-10 flex items-center justify-center rounded-full bg-accent hover:bg-accent-hover transition-colors text-white disabled:opacity-50 shadow-md transform hover:scale-105"
                >
                  <Send size={16} className="translate-x-[1px] translate-y-[1px]" />
                </button>
                <AnimatePresence>
                  {showSchedule && (
                    <>
                      <div className="fixed inset-0 z-40" onClick={() => setShowSchedule(false)} />
                      <motion.div
                        initial={{ opacity: 0, scale: 0.9, y: 10 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.9, y: 10 }}
                        className="absolute bottom-[calc(100%+12px)] right-0 w-72 rounded-2xl glass-strong shadow-2xl z-50 border border-white/10 backdrop-blur-3xl overflow-hidden"
                      >
                        {/* Header */}
                        <div className="flex items-center gap-2 px-4 pt-4 pb-2">
                          {scheduleStep === 'custom' && (
                            <button onClick={() => setScheduleStep('presets')} className="p-1 rounded-lg hover:bg-white/10 text-zinc-400 hover:text-white transition-colors">
                              <ChevronLeft size={16} />
                            </button>
                          )}
                          <Clock size={16} className="text-vortex-400" />
                          <span className="text-sm font-medium text-zinc-200">{t('scheduleMessage')}</span>
                        </div>

                        {scheduleStep === 'presets' ? (
                          <div className="p-2 space-y-1">
                            {/* Preset: 1 hour */}
                            <button
                              onClick={() => {
                                const d = new Date(Date.now() + 3600000);
                                handleSend(d.toISOString());
                                setShowSchedule(false);
                                setScheduleToast(d.toLocaleString());
                              }}
                              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm text-zinc-200 hover:bg-white/10 transition-colors text-left"
                            >
                              <Clock size={15} className="text-zinc-400 flex-shrink-0" />
                              {t('scheduleIn1h')}
                            </button>
                            {/* Preset: 3 hours */}
                            <button
                              onClick={() => {
                                const d = new Date(Date.now() + 3 * 3600000);
                                handleSend(d.toISOString());
                                setShowSchedule(false);
                                setScheduleToast(d.toLocaleString());
                              }}
                              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm text-zinc-200 hover:bg-white/10 transition-colors text-left"
                            >
                              <Clock size={15} className="text-zinc-400 flex-shrink-0" />
                              {t('scheduleIn3h')}
                            </button>
                            {/* Preset: Tomorrow 9:00 */}
                            <button
                              onClick={() => {
                                const d = new Date();
                                d.setDate(d.getDate() + 1);
                                d.setHours(9, 0, 0, 0);
                                handleSend(d.toISOString());
                                setShowSchedule(false);
                                setScheduleToast(d.toLocaleString());
                              }}
                              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm text-zinc-200 hover:bg-white/10 transition-colors text-left"
                            >
                              <Calendar size={15} className="text-zinc-400 flex-shrink-0" />
                              {t('scheduleTomorrow')}
                            </button>
                            <div className="border-t border-white/5 my-1" />
                            {/* Custom */}
                            <button
                              onClick={() => {
                                const now = new Date();
                                setScheduleCalYear(now.getFullYear());
                                setScheduleCalMonth(now.getMonth());
                                const m = String(now.getMonth() + 1).padStart(2, '0');
                                const d = String(now.getDate()).padStart(2, '0');
                                setScheduleCalDate(`${now.getFullYear()}-${m}-${d}`);
                                setScheduleHour(String(Math.min(now.getHours() + 1, 23)).padStart(2, '0'));
                                setScheduleMinute(String(now.getMinutes()).padStart(2, '0'));
                                setScheduleStep('custom');
                              }}
                              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm text-vortex-400 hover:bg-white/10 transition-colors text-left"
                            >
                              <Calendar size={15} className="flex-shrink-0" />
                              {t('scheduleCustom')}
                            </button>
                          </div>
                        ) : (
                          <ScheduleCalendar
                            calDate={scheduleCalDate}
                            setCalDate={setScheduleCalDate}
                            calMonth={scheduleCalMonth}
                            setCalMonth={setScheduleCalMonth}
                            calYear={scheduleCalYear}
                            setCalYear={setScheduleCalYear}
                            hour={scheduleHour}
                            setHour={setScheduleHour}
                            minute={scheduleMinute}
                            setMinute={setScheduleMinute}
                            onSend={(iso) => {
                              handleSend(iso);
                              setShowSchedule(false);
                              setScheduleToast(new Date(iso).toLocaleString());
                            }}
                            t={t}
                          />
                        )}
                      </motion.div>
                    </>
                  )}
                </AnimatePresence>
              </>
            ) : (
              <button
                onClick={() => {
                  // Only trigger on desktop (no touch support)
                  if (!('ontouchstart' in window)) {
                    startRecording(true);
                  }
                }}
                onTouchStart={handleMicTouchStart}
                onTouchMove={handleMicTouchMove}
                onTouchEnd={handleMicTouchEnd}
                className="w-10 h-10 flex items-center justify-center rounded-full bg-white/10 text-white/70 hover:text-white hover:bg-white/20 transition-all shadow-md transform hover:scale-105"
              >
                <Mic size={18} />
              </button>
            )}
          </div>
        </div>
      )}
      </AnimatePresence>

      {/* Formatting Context Menu */}
      <AnimatePresence>
        {formatMenu.show && (
          <>
            <div className="fixed inset-0 z-50 cursor-pointer" onClick={() => setFormatMenu({ ...formatMenu, show: false })} onContextMenu={(e) => { e.preventDefault(); setFormatMenu({ ...formatMenu, show: false }); }} />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              className="fixed z-[9999] w-48 rounded-2xl glass-strong shadow-2xl py-1"
              style={{ left: formatMenu.x, top: formatMenu.y - 180 }}
            >
              <button
                onClick={() => applyFormat('**', '**')}
                className="flex items-center gap-3 w-full px-4 py-2 text-sm text-zinc-200 hover:bg-white/10 transition-colors"
              >
                <b className="font-bold">{t('formatBold')}</b> <span className="text-xs text-zinc-500 ml-auto">{t('formatBoldHint')}</span>
              </button>
              <button
                onClick={() => applyFormat('_', '_')}
                className="flex items-center gap-3 w-full px-4 py-2 text-sm text-zinc-200 hover:bg-white/10 transition-colors"
              >
                <em className="italic">{t('formatItalic')}</em> <span className="text-xs text-zinc-500 ml-auto">{t('formatItalicHint')}</span>
              </button>
              <button
                onClick={() => applyFormat('~', '~')}
                className="flex items-center gap-3 w-full px-4 py-2 text-sm text-zinc-200 hover:bg-white/10 transition-colors"
              >
                <del className="line-through">{t('formatStrike')}</del> <span className="text-xs text-zinc-500 ml-auto">{t('formatStrikeHint')}</span>
              </button>
              <button
                onClick={() => applyFormat('`', '`')}
                className="flex items-center gap-3 w-full px-4 py-2 text-sm text-zinc-200 hover:bg-white/10 transition-colors"
              >
                <code className="bg-black/20 rounded px-1 font-mono">{t('formatMono')}</code> <span className="text-xs text-zinc-500 ml-auto">{t('formatMonoHint')}</span>
              </button>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Schedule toast notification */}
      <AnimatePresence>
        {scheduleToast && (
          <motion.div
            initial={{ opacity: 0, y: -10, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -10, scale: 0.95 }}
            onAnimationComplete={() => {
              setTimeout(() => setScheduleToast(null), 3500);
            }}
            className="absolute bottom-[calc(100%+8px)] left-1/2 -translate-x-1/2 z-[9999] px-4 py-2.5 rounded-xl bg-surface shadow-2xl border border-border flex items-center gap-2 whitespace-nowrap"
          >
            <Check size={16} className="text-emerald-400 flex-shrink-0" />
            <span className="text-sm text-zinc-200">{t('messageScheduled')}</span>
          </motion.div>
        )}
      </AnimatePresence>
      </>
      )}
    </div>
  );
}

/* =================== Schedule Mini Calendar =================== */
function ScheduleCalendar({
  calDate, setCalDate, calMonth, setCalMonth, calYear, setCalYear,
  hour, setHour, minute, setMinute, onSend, t,
}: {
  calDate: string;
  setCalDate: (v: string) => void;
  calMonth: number;
  setCalMonth: (v: number) => void;
  calYear: number;
  setCalYear: (v: number) => void;
  hour: string;
  setHour: (v: string) => void;
  minute: string;
  setMinute: (v: string) => void;
  onSend: (iso: string) => void;
  t: (k: any) => any;
}) {
  const today = new Date();
  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

  const daysInMonth = new Date(calYear, calMonth + 1, 0).getDate();
  const firstDayRaw = new Date(calYear, calMonth, 1).getDay();
  const firstDay = firstDayRaw === 0 ? 6 : firstDayRaw - 1;
  const cells: (number | null)[] = [];
  for (let i = 0; i < firstDay; i++) cells.push(null);
  for (let d2 = 1; d2 <= daysInMonth; d2++) cells.push(d2);

  const weekDays = t('weekDays') as string[];
  const months = t('months') as string[];

  const prevMonth = () => {
    if (calMonth === 0) { setCalMonth(11); setCalYear(calYear - 1); }
    else setCalMonth(calMonth - 1);
  };
  const nextMonth = () => {
    if (calMonth === 11) { setCalMonth(0); setCalYear(calYear + 1); }
    else setCalMonth(calMonth + 1);
  };

  const selectDay = (day: number) => {
    const m = String(calMonth + 1).padStart(2, '0');
    const d = String(day).padStart(2, '0');
    setCalDate(`${calYear}-${m}-${d}`);
  };

  const isSelected = (day: number) => {
    const m = String(calMonth + 1).padStart(2, '0');
    const d = String(day).padStart(2, '0');
    return calDate === `${calYear}-${m}-${d}`;
  };

  const isToday = (day: number) => {
    return today.getFullYear() === calYear && today.getMonth() === calMonth && today.getDate() === day;
  };

  const isPast = (day: number) => {
    const m = String(calMonth + 1).padStart(2, '0');
    const d = String(day).padStart(2, '0');
    return `${calYear}-${m}-${d}` < todayStr;
  };

  const canSend = (() => {
    if (!calDate) return false;
    const dt = new Date(`${calDate}T${hour}:${minute}:00`);
    return dt.getTime() > Date.now();
  })();

  const handleSend = () => {
    if (!canSend) return;
    const dt = new Date(`${calDate}T${hour}:${minute}:00`);
    onSend(dt.toISOString());
  };

  return (
    <div>
      {/* Mini calendar header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-white/5">
        <button onClick={prevMonth} className="p-1 rounded-lg hover:bg-white/10 text-zinc-400 hover:text-white transition-colors">
          <ChevronLeft size={16} />
        </button>
        <span className="text-xs font-medium text-zinc-300">{months[calMonth]} {calYear}</span>
        <button onClick={nextMonth} className="p-1 rounded-lg hover:bg-white/10 text-zinc-400 hover:text-white transition-colors">
          <ChevronRight size={16} />
        </button>
      </div>

      {/* Weekday headers */}
      <div className="grid grid-cols-7 px-2 pt-1">
        {weekDays.map((d) => (
          <div key={d} className="text-center text-[10px] text-zinc-500 font-medium py-0.5">{d}</div>
        ))}
      </div>

      {/* Days grid */}
      <div className="grid grid-cols-7 px-2 pb-2">
        {cells.map((day, i) => (
          <div key={i} className="flex items-center justify-center">
            {day ? (
              <button
                onClick={() => !isPast(day) && selectDay(day)}
                disabled={isPast(day)}
                className={`w-7 h-7 rounded-full text-xs flex items-center justify-center transition-all ${
                  isSelected(day)
                    ? 'bg-accent text-white font-semibold shadow-lg shadow-accent/30'
                    : isPast(day)
                      ? 'text-zinc-600 cursor-not-allowed'
                      : isToday(day)
                        ? 'text-vortex-400 font-semibold ring-1 ring-vortex-500/50'
                        : 'text-zinc-300 hover:bg-white/10'
                }`}
              >
                {day}
              </button>
            ) : (
              <span className="w-7 h-7" />
            )}
          </div>
        ))}
      </div>

      {/* Time picker */}
      <div className="px-3 pb-2">
        <label className="text-[11px] text-zinc-500 mb-1 block">{t('scheduleTime')}</label>
        <div className="flex items-center gap-2">
          <select
            value={hour}
            onChange={(e) => setHour(e.target.value)}
            className="flex-1 bg-white/5 border border-white/10 rounded-lg px-2 py-1.5 text-sm text-zinc-200 focus:outline-none focus:border-vortex-500/50 appearance-none text-center"
          >
            {Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0')).map((h) => (
              <option key={h} value={h} className="bg-zinc-800">{h}</option>
            ))}
          </select>
          <span className="text-zinc-400 font-bold">:</span>
          <select
            value={minute}
            onChange={(e) => setMinute(e.target.value)}
            className="flex-1 bg-white/5 border border-white/10 rounded-lg px-2 py-1.5 text-sm text-zinc-200 focus:outline-none focus:border-vortex-500/50 appearance-none text-center"
          >
            {Array.from({ length: 60 }, (_, i) => String(i).padStart(2, '0')).map((m) => (
              <option key={m} value={m} className="bg-zinc-800">{m}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Send button */}
      <div className="px-3 pb-3">
        <button
          onClick={handleSend}
          disabled={!canSend}
          className="w-full py-2 rounded-xl bg-accent hover:bg-accent-hover disabled:bg-zinc-700 disabled:text-zinc-500 text-white text-sm font-medium transition-colors"
        >
          {t('scheduleSend')}
        </button>
      </div>
    </div>
  );
}