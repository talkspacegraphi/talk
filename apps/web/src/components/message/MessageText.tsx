import { Suspense, lazy, useState, memo } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import type { Message } from '../../lib/types';
import { useChatStore } from '../../stores/chatStore';

const AnimatedEmoji = lazy(() => import('../AnimatedEmoji'));

interface MessageTextProps {
  content: string;
  isMine: boolean;
  message: Message;
  onViewProfile?: (userId: string) => void;
}

function MessageText({ content, isMine, message, onViewProfile }: MessageTextProps) {
  const [pendingLink, setPendingLink] = useState<string | null>(null);
  const [showLinkModal, setShowLinkModal] = useState(false);
  const chats = useChatStore(s => s.chats);

  if (!content) return null;

  const isPureDigits = /^\d+$/.test(content.trim());
  const emojiOnlyRegex = /^[\p{Emoji}\s]+$/u;
  const isEmojiOnly = emojiOnlyRegex.test(content.trim()) && !isPureDigits;
  const emojiCount = (content.match(/\p{Emoji}/gu) || []).length;

  // Small emoji-only messages (1-3 emoji)
  if (isEmojiOnly && emojiCount <= 3) {
    const emojis = content.match(/\p{Emoji}/gu) || [];
    return (
      <span className="flex gap-1">
        {emojis.map((emoji, i) => (
          <Suspense key={i} fallback={<span className="text-2xl">{emoji}</span>}>
            <AnimatedEmoji emoji={emoji} message={message} isMine={isMine} />
          </Suspense>
        ))}
      </span>
    );
  }

  // Markdown formatting
  const parts = content.split(/(\*\*[\s\S]*?\*\*|\*[\s\S]*?\*|_[\s\S]*?_|~[\s\S]*?~|`[\s\S]*?`|@\w+|https?:\/\/[^\s]+|\p{Emoji})/gu);

  return (
    <>
      <p className="text-sm whitespace-pre-wrap break-words flex-1 leading-relaxed" style={{ overflowWrap: 'break-word', wordBreak: 'break-word' }}>
        {parts.map((part, i) => {
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
          if (/\p{Emoji}/u.test(part) && part.trim().length <= 2) {
            return <span key={i} className="text-base inline-block">{part}</span>;
          }
          return <span key={i}>{part}</span>;
        })}
      </p>

      {/* Link confirmation modal — portal to escape parent transforms */}
      {showLinkModal && pendingLink && createPortal(
        <AnimatePresence>
          <LinkConfirmModal
            url={pendingLink}
            onClose={() => { setShowLinkModal(false); setPendingLink(null); }}
            onOpen={() => {
              window.open(pendingLink, '_blank', 'noopener,noreferrer');
              setShowLinkModal(false);
              setPendingLink(null);
            }}
          />
        </AnimatePresence>,
        document.body
      )}
    </>
  );
}

function LinkConfirmModal({ url, onClose, onOpen }: { url: string; onClose: () => void; onOpen: () => void }) {
  return (
    <>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[200]"
        onClick={(e) => { e.stopPropagation(); onClose(); }}
      />
      <div className="fixed inset-0 flex items-center justify-center z-[201] pointer-events-none">
        <motion.div
          initial={{ opacity: 0, scale: 0.9, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.9, y: 20 }}
          transition={{ type: 'spring', stiffness: 400, damping: 25 }}
          className="bg-surface-secondary border border-border rounded-2xl shadow-2xl p-6 mx-4 w-full max-w-md pointer-events-auto"
        >
          <div className="flex items-center gap-3 mb-4">
            <div className="w-12 h-12 rounded-full bg-amber-500/20 flex items-center justify-center flex-shrink-0">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-amber-400"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" /><polyline points="15 3 21 3 21 9" /><line x1="10" y1="14" x2="21" y2="3" /></svg>
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="text-lg font-semibold text-white">Открыть ссылку</h3>
              <p className="text-sm text-zinc-400 mt-0.5">Вы уверены что хотите перейти по ссылке?</p>
            </div>
          </div>
          <div className="bg-black/20 rounded-xl p-3 mb-4 border border-white/5">
            <p className="text-xs text-zinc-400 mb-1 font-medium">Ссылка:</p>
            <p className="text-sm text-vortex-400 break-all">{url}</p>
          </div>
          <div className="flex gap-3">
            <button onClick={(e) => { e.stopPropagation(); onClose(); }} className="flex-1 px-4 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-zinc-300 hover:text-white transition-all text-sm font-medium">
              Отмена
            </button>
            <button onClick={onOpen} className="flex-1 px-4 py-2.5 rounded-xl bg-vortex-500 hover:bg-vortex-600 text-white transition-all text-sm font-medium flex items-center justify-center gap-2">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" /><polyline points="15 3 21 3 21 9" /><line x1="10" y1="14" x2="21" y2="3" /></svg>
              Открыть
            </button>
          </div>
        </motion.div>
      </div>
    </>
  );
}

export default memo(MessageText);
