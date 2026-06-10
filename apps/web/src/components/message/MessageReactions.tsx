import { memo } from 'react';
import { getSocket } from '../../lib/socket';
import { useAuthStore } from '../../stores/authStore';
import type { Reaction } from '../../lib/types';

interface MessageReactionsProps {
  reactions: Reaction[];
  messageId: string;
  chatId: string;
}

function MessageReactions({ reactions, messageId, chatId }: MessageReactionsProps) {
  const user = useAuthStore(s => s.user);

  if (!reactions || reactions.length === 0) return null;

  const groups: Record<string, { count: number; users: string[]; isMine: boolean }> = {};
  reactions.forEach((r) => {
    if (!groups[r.emoji]) {
      groups[r.emoji] = { count: 0, users: [], isMine: false };
    }
    groups[r.emoji].count++;
    groups[r.emoji].users.push(r.user?.displayName || r.user?.username || '');
    if (r.userId === user?.id) groups[r.emoji].isMine = true;
  });

  const handleReaction = (emoji: string) => {
    const socket = getSocket();
    if (!socket) return;
    const existingReaction = reactions.find(
      (r) => r.userId === user?.id && r.emoji === emoji
    );
    if (existingReaction) {
      socket.emit('remove_reaction', { messageId, chatId, emoji });
    } else {
      socket.emit('add_reaction', { messageId, chatId, emoji });
    }
  };

  return (
    <div className="flex flex-wrap gap-1 mt-1 mx-1">
      {Object.entries(groups).map(([emoji, data]) => (
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
  );
}

export default memo(MessageReactions);
