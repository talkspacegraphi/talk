import type { Message, ChatMember } from '../../lib/types';

export interface MessageContext {
  message: Message;
  isMine: boolean;
  isRead: boolean;
  timeStr: string;
  chatId: string;
  onViewProfile?: (userId: string) => void;
}

export interface MessageTextProps {
  content: string;
  isMine: boolean;
  isEmojiOnly: boolean;
  emojis: string[];
  message: Message;
  onViewProfile?: (userId: string) => void;
}
