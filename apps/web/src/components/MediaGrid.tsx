import { useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { ChevronLeft, ChevronRight, X, Download, Star } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import type { MediaItem } from '../lib/types';
import DiscordVideoPlayer, { FullscreenVideoOverlay } from './DiscordVideoPlayer';

interface MediaGridProps {
  media: MediaItem[];
  isMine: boolean;
  hasContent: boolean;
  onFavoriteGif?: (url: string) => void;
  favoriteGifs?: string[];
}

function isGifItem(item: MediaItem): boolean {
  return item.url.toLowerCase().includes('.gif') || (item.filename?.toLowerCase().endsWith('.gif') ?? false);
}

export default function MediaGrid({ media, isMine, hasContent, onFavoriteGif, favoriteGifs = [] }: MediaGridProps) {
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const [fullscreenVideo, setFullscreenVideo] = useState<MediaItem | null>(null);

  const images = media.filter((m) => m.type === 'image');
  const videos = media.filter((m) => m.type === 'video');
  const totalMedia = [...images, ...videos];

  const openLightbox = (index: number) => setLightboxIndex(index);
  const closeLightbox = () => setLightboxIndex(null);

  const goPrev = useCallback(() => {
    setLightboxIndex((prev) => (prev === null ? null : prev === 0 ? totalMedia.length - 1 : prev - 1));
  }, [totalMedia.length]);

  const goNext = useCallback(() => {
    setLightboxIndex((prev) => (prev === null ? null : prev === totalMedia.length - 1 ? 0 : prev + 1));
  }, [totalMedia.length]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'ArrowLeft') goPrev();
    if (e.key === 'ArrowRight') goNext();
    if (e.key === 'Escape') closeLightbox();
  }, [goPrev, goNext]);

  if (totalMedia.length === 0) return null;

  // Grid layout logic
  const renderGrid = () => {
    const count = totalMedia.length;
    const items = totalMedia;

    // Single image/video
    if (count === 1) {
      const item = items[0];
      const gif = isGifItem(item);
      return (
        <div className="relative overflow-hidden rounded-[1.25rem] group">
          {item.type === 'video' ? (
            <DiscordVideoPlayer
              item={item}
              onFullscreen={() => setFullscreenVideo(item)}
            />
          ) : (
            <div className="relative">
              <img
                src={item.url}
                alt=""
                className="max-w-full max-h-80 w-full object-cover cursor-pointer hover:brightness-90 transition-all"
                onClick={() => openLightbox(0)}
                style={gif ? { imageRendering: 'auto' } : undefined}
              />
              {/* GIF: star only on hover */}
              {gif && onFavoriteGif && (
                <button
                  onClick={(e) => { e.stopPropagation(); onFavoriteGif(item.url); }}
                  className="absolute top-2 left-2 p-1.5 rounded-full bg-black/70 hover:bg-black/90 z-10 opacity-0 group-hover:opacity-100 transition-opacity"
                  title="В избранное"
                >
                  <Star
                    size={16}
                    className={favoriteGifs.includes(item.url) ? 'text-yellow-400 fill-yellow-400' : 'text-white'}
                  />
                </button>
              )}
            </div>
          )}
        </div>
      );
    }

    // 2 items — side by side
    if (count === 2) {
      return (
        <div className="grid grid-cols-2 gap-0.5 rounded-[1.25rem] overflow-hidden">
          {items.map((item, i) => (
            <div key={item.id} className="group">
              <MediaThumb
                item={item}
                onClick={() => openLightbox(i)}
                className="aspect-square"
                onFavoriteGif={onFavoriteGif}
                favoriteGifs={favoriteGifs}
              />
            </div>
          ))}
        </div>
      );
    }

    // 3 items — 2 top, 1 bottom full width
    if (count === 3) {
      return (
        <div className="grid grid-cols-2 gap-0.5 rounded-[1.25rem] overflow-hidden">
          <div className="group"><MediaThumb item={items[0]} onClick={() => openLightbox(0)} className="col-span-1 aspect-square" onFavoriteGif={onFavoriteGif} favoriteGifs={favoriteGifs} /></div>
          <div className="group"><MediaThumb item={items[1]} onClick={() => openLightbox(1)} className="col-span-1 aspect-square" onFavoriteGif={onFavoriteGif} favoriteGifs={favoriteGifs} /></div>
          <div className="group col-span-2"><MediaThumb item={items[2]} onClick={() => openLightbox(2)} className="col-span-2 aspect-[2/1]" onFavoriteGif={onFavoriteGif} favoriteGifs={favoriteGifs} /></div>
        </div>
      );
    }

    // 4+ items — 2x2 grid with overflow counter
    return (
      <div className="grid grid-cols-2 gap-0.5 rounded-[1.25rem] overflow-hidden">
        {items.slice(0, 4).map((item, i) => (
          <div key={item.id} className="relative aspect-square group">
            <MediaThumb item={item} onClick={() => openLightbox(i)} className="w-full h-full" onFavoriteGif={onFavoriteGif} favoriteGifs={favoriteGifs} />
            {count > 4 && i === 3 && (
              <div className="absolute inset-0 bg-black/60 flex items-center justify-center cursor-pointer" onClick={() => openLightbox(3)}>
                <span className="text-white text-2xl font-bold">+{count - 4}</span>
              </div>
            )}
          </div>
        ))}
      </div>
    );
  };

  const currentItem = lightboxIndex !== null ? totalMedia[lightboxIndex] : null;
  const isCurrentGif = currentItem ? isGifItem(currentItem) : false;

  return (
    <>
      <div className={`${hasContent ? 'mb-2' : ''}`}>
        {renderGrid()}
      </div>

      {/* Lightbox — portal to body */}
      {lightboxIndex !== null && currentItem && createPortal(
        <AnimatePresence>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[99999] bg-black/95 flex items-center justify-center"
            onClick={closeLightbox}
            onKeyDown={handleKeyDown}
            tabIndex={0}
            ref={(el) => el?.focus()}
          >
            <div className="absolute inset-0" onClick={closeLightbox} />

            {/* Close button */}
            <button
              onClick={closeLightbox}
              className="fixed top-4 right-4 z-10 w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white transition-colors backdrop-blur-md"
            >
              <X size={20} />
            </button>

            {/* Download button for images (not for GIFs) */}
            {!isCurrentGif && currentItem.type !== 'video' && (
              <a
                href={currentItem.url}
                download={currentItem.filename || 'image'}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
                className="fixed top-4 right-16 z-10 w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white transition-colors backdrop-blur-md"
                title="Сохранить"
              >
                <Download size={18} />
              </a>
            )}

            {/* GIF favorite button in lightbox */}
            {isCurrentGif && onFavoriteGif && (
              <button
                onClick={(e) => { e.stopPropagation(); onFavoriteGif(currentItem.url); }}
                className="fixed top-4 right-16 z-10 w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white transition-colors backdrop-blur-md"
                title={favoriteGifs.includes(currentItem.url) ? 'Удалить из избранного' : 'В избранное'}
              >
                <Star
                  size={18}
                  className={favoriteGifs.includes(currentItem.url) ? 'text-yellow-400 fill-yellow-400' : 'text-white'}
                />
              </button>
            )}

            {/* Navigation arrows */}
            {totalMedia.length > 1 && (
              <>
                <button
                  onClick={(e) => { e.stopPropagation(); goPrev(); }}
                  className="fixed left-4 top-1/2 -translate-y-1/2 z-10 w-12 h-12 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white transition-colors backdrop-blur-md"
                >
                  <ChevronLeft size={28} />
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); goNext(); }}
                  className="fixed right-4 top-1/2 -translate-y-1/2 z-10 w-12 h-12 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white transition-colors backdrop-blur-md"
                >
                  <ChevronRight size={28} />
                </button>
              </>
            )}

            {/* Counter */}
            {totalMedia.length > 1 && (
              <div className="fixed top-4 left-1/2 -translate-x-1/2 z-10 px-4 py-1.5 rounded-full bg-white/10 text-white text-sm font-medium backdrop-blur-md">
                {lightboxIndex + 1} / {totalMedia.length}
              </div>
            )}

            {/* Media */}
            <motion.div
              key={lightboxIndex}
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              transition={{ duration: 0.2 }}
              className="relative z-10 flex items-center justify-center"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="bg-zinc-900 rounded-2xl overflow-hidden shadow-2xl" style={{ maxWidth: '90vw', maxHeight: '90vh' }}>
                {currentItem.type === 'video' ? (
                  <video src={currentItem.url} controls autoPlay className="max-w-[90vw] max-h-[90vh]" />
                ) : (
                  <img
                    src={currentItem.url}
                    alt=""
                    className="max-w-[90vw] max-h-[90vh] object-contain"
                    style={{ maxWidth: '90vw', maxHeight: '90vh', width: 'auto', height: 'auto' }}
                  />
                )}
              </div>
            </motion.div>
          </motion.div>
        </AnimatePresence>,
        document.body
      )}

      {/* Fullscreen video overlay */}
      {fullscreenVideo && (
        <FullscreenVideoOverlay
          item={fullscreenVideo}
          onClose={() => setFullscreenVideo(null)}
        />
      )}
    </>
  );
}

interface MediaThumbProps {
  item: MediaItem;
  onClick: () => void;
  className?: string;
  onFavoriteGif?: (url: string) => void;
  favoriteGifs?: string[];
}

function MediaThumb({ item, onClick, className = '', onFavoriteGif, favoriteGifs = [] }: MediaThumbProps) {
  const gif = isGifItem(item);

  if (item.type === 'video') {
    return (
      <div
        className={`relative bg-black overflow-hidden ${className} cursor-pointer hover:brightness-90 transition-all`}
        onClick={onClick}
      >
        <video src={item.url} className="w-full h-full object-contain bg-black" />
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="w-10 h-10 rounded-full bg-black/50 flex items-center justify-center">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="white"><polygon points="5,3 19,12 5,21" /></svg>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`relative ${className}`}>
      <img
        src={item.url}
        alt=""
        className="w-full h-full object-cover cursor-pointer hover:brightness-90 transition-all"
        onClick={onClick}
        style={gif ? { imageRendering: 'auto' } : undefined}
      />
      {/* GIF star button — only on hover */}
      {gif && onFavoriteGif && (
        <button
          onClick={(e) => { e.stopPropagation(); onClick(); onFavoriteGif(item.url); }}
          className="absolute top-1.5 left-1.5 p-1 rounded-full bg-black/70 hover:bg-black/90 z-10 opacity-0 group-hover:opacity-100 transition-opacity"
          title={favoriteGifs.includes(item.url) ? 'Удалить из избранного' : 'В избранное'}
        >
          <Star
            size={13}
            className={favoriteGifs.includes(item.url) ? 'text-yellow-400 fill-yellow-400' : 'text-white'}
          />
        </button>
      )}
    </div>
  );
}
