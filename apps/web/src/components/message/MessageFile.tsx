import { memo } from 'react';
import { FileText, Download } from 'lucide-react';
import type { MediaItem } from '../../lib/types';

interface MessageFileProps {
  media: MediaItem[];
  isMine: boolean;
}

function MessageFile({ media, isMine }: MessageFileProps) {
  const files = media.filter((m) => m.type !== 'image' && m.type !== 'voice' && m.type !== 'video' && m.type !== 'audio');

  if (files.length === 0) return null;

  return (
    <>
      {files.map((m, idx) => (
        <a
          key={`${m.id}-${idx}`}
          href={m.url}
          download={m.filename || 'file'}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          className={`flex items-center gap-3 p-2 rounded-xl w-full overflow-hidden ${isMine ? 'bg-white/10 hover:bg-white/15' : 'bg-surface-tertiary hover:bg-surface-hover'
            } transition-colors mb-1`}
        >
          <div className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${isMine ? 'bg-white/20' : 'bg-vortex-500/20'}`}>
            <FileText size={20} className={isMine ? 'text-white' : 'text-vortex-400'} />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm line-clamp-2" style={{ wordBreak: 'break-word' }}>{m.filename || 'Файл'}</p>
            <p className={`text-xs ${isMine ? 'text-white/50' : 'text-zinc-500'}`}>
              {m.size ? `${(m.size / 1024).toFixed(1)} KB` : 'Загрузить'}
            </p>
          </div>
          <Download size={16} className={`flex-shrink-0 ${isMine ? 'text-white/50' : 'text-zinc-500'}`} />
        </a>
      ))}
    </>
  );
}

export default memo(MessageFile);
