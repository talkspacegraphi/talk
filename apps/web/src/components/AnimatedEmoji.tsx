interface AnimatedEmojiProps {
  emoji: string;
  message?: any;
  isMine?: boolean;
}

export default function AnimatedEmoji({ emoji }: AnimatedEmojiProps) {
  // No full-screen animation, just display the emoji normally at a moderate size
  return (
    <span
      className="text-2xl inline-block"
      title="Нажмите для реакции"
    >
      {emoji}
    </span>
  );
}
