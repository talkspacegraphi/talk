import { ExternalLink, Play } from 'lucide-react';
import type { LinkPreview as LinkPreviewType } from '../lib/linkPreview';

interface LinkPreviewProps {
  preview: LinkPreviewType;
  isMine: boolean;
}

export default function LinkPreview({ preview, isMine }: LinkPreviewProps) {
  if (preview.type === 'youtube' && preview.youtubeId) {
    return (
      <a
        href={preview.url}
        target="_blank"
        rel="noopener noreferrer"
        className={`block rounded-xl overflow-hidden border transition-all hover:brightness-95 ${
          isMine ? 'border-white/10 bg-white/5' : 'border-white/10 bg-black/20'
        }`}
      >
        <div className="relative aspect-video bg-black">
          <img
            src={`https://img.youtube.com/vi/${preview.youtubeId}/maxresdefault.jpg`}
            alt={preview.title || 'YouTube video'}
            loading="lazy"
            decoding="async"
            className="w-full h-full object-cover"
            onError={(e) => {
              // Fallback to hqdefault if maxresdefault doesn't exist
              e.currentTarget.src = `https://img.youtube.com/vi/${preview.youtubeId}/hqdefault.jpg`;
            }}
          />
          <div className="absolute inset-0 flex items-center justify-center bg-black/30">
            <div className="w-16 h-16 rounded-full bg-red-600 flex items-center justify-center shadow-lg">
              <Play size={28} className="text-white ml-1" fill="white" />
            </div>
          </div>
        </div>
        {preview.title && (
          <div className="p-3">
            <p className="text-sm font-medium text-zinc-200 line-clamp-2">{preview.title}</p>
            <p className="text-xs text-zinc-500 mt-1 flex items-center gap-1">
              <ExternalLink size={12} />
              YouTube
            </p>
          </div>
        )}
      </a>
    );
  }

  // Generic link preview
  return (
    <a
      href={preview.url}
      target="_blank"
      rel="noopener noreferrer"
      className={`block rounded-xl overflow-hidden border transition-all hover:brightness-95 ${
        isMine ? 'border-white/10 bg-white/5' : 'border-white/10 bg-black/20'
      }`}
    >
      {preview.image && (
        <div className="aspect-video bg-black">
          <img
            src={preview.image}
            alt={preview.title || 'Link preview'}
            loading="lazy"
            decoding="async"
            className="w-full h-full object-cover"
          />
        </div>
      )}
      <div className="p-3">
        {preview.title && (
          <p className="text-sm font-medium text-zinc-200 line-clamp-2">{preview.title}</p>
        )}
        {preview.description && (
          <p className="text-xs text-zinc-400 mt-1 line-clamp-2">{preview.description}</p>
        )}
        <p className="text-xs text-zinc-500 mt-2 flex items-center gap-1">
          <ExternalLink size={12} />
          {preview.siteName || new URL(preview.url).hostname}
        </p>
      </div>
    </a>
  );
}
