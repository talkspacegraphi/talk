import { useState, useCallback, useRef, useEffect } from 'react';
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
  if (!item.url) return false;
  return item.url.toLowerCase().includes('.gif') || (item.filename?.toLowerCase().endsWith('.gif') ?? false);
}

export default function MediaGrid({ media, isMine, hasContent, onFavoriteGif, favoriteGifs = [] }: MediaGridProps) {
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const [fullscreenVideo, setFullscreenVideo] = useState<MediaItem | null>(null);
  const touchStartX = useRef(0);
  const [swipeX, setSwipeX] = useState(0);
  const lightboxRef = useRef<HTMLDivElement>(null);

  const images = media.filter((m) => m.type === 'image');
  const videos = media.filter((m) => m.type === 'video');
  const totalMedia = [...images, ...videos];

  const openLightbox = (index: number) => {
    setLightboxIndex(index);
    history.pushState({ lightbox: true }, '');
  };
  const closeLightbox = () => {
    setLightboxIndex(null);
    setSwipeX(0);
    // Pop the history entry we pushed when opening (if it's ours)
    if (history.state?.lightbox) {
      history.back();
    }
  };

  const goPrev = useCallback(() => {
    setLightboxIndex((prev) => (prev === null ? null : prev === 0 ? totalMedia.length - 1 : prev - 1));
    setSwipeX(0);
  }, [totalMedia.length]);

  const goNext = useCallback(() => {
    setLightboxIndex((prev) => (prev === null ? null : prev === totalMedia.length - 1 ? 0 : prev + 1));
    setSwipeX(0);
  }, [totalMedia.length]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'ArrowLeft') goPrev();
    if (e.key === 'ArrowRight') goNext();
    if (e.key === 'Escape') closeLightbox();
  }, [goPrev, goNext]);

  useEffect(() => {
    if (lightboxIndex !== null && lightboxRef.current) {
      lightboxRef.current.focus();
    }
  }, [lightboxIndex]);

  // Android back button: popstate event closes lightbox
  useEffect(() => {
    const onPopState = () => {
      if (lightboxIndex !== null) {
        setLightboxIndex(null);
        setSwipeX(0);
      }
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, [lightboxIndex]);

  useEffect(() => {
    return () => { setSwipeX(0); };
  }, []);

  if (totalMedia.length === 0) return null;

  const renderGrid = () => {
    const count = totalMedia.length;
    const items = totalMedia;

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
                loading="lazy"
                decoding="async"
                className="max-w-full max-h-80 w-full object-cover cursor-pointer hover:brightness-90 transition-all"
                onClick={() => openLightbox(0)}
                style={gif ? { imageRendering: 'auto' } : undefined}
                onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
              />
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

    if (count === 2) {
      return (
        <div className="grid grid-cols-2 gap-0.5 rounded-[1.25rem] overflow-hidden">
          {items.map((item, i) => (
            <div key={item.id} className="group">
              <MediaThumb item={item} onClick={() => openLightbox(i)} className="aspect-square" onFavoriteGif={onFavoriteGif} favoriteGifs={favoriteGifs} />
            </div>
          ))}
        </div>
      );
    }

    if (count === 3) {
      return (
        <div className="grid grid-cols-2 gap-0.5 rounded-[1.25rem] overflow-hidden">
          <div className="group"><MediaThumb item={items[0]} onClick={() => openLightbox(0)} className="col-span-1 aspect-square" onFavoriteGif={onFavoriteGif} favoriteGifs={favoriteGifs} /></div>
          <div className="group"><MediaThumb item={items[1]} onClick={() => openLightbox(1)} className="col-span-1 aspect-square" onFavoriteGif={onFavoriteGif} favoriteGifs={favoriteGifs} /></div>
          <div className="group col-span-2"><MediaThumb item={items[2]} onClick={() => openLightbox(2)} className="col-span-2 aspect-[2/1]" onFavoriteGif={onFavoriteGif} favoriteGifs={favoriteGifs} /></div>
        </div>
      );
    }

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

      {lightboxIndex !== null && currentItem && createPortal(
        <AnimatePresence>
          <motion.div
            ref={lightboxRef}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[99999] bg-black/95 flex items-center justify-center outline-none"
            onKeyDown={handleKeyDown}
            tabIndex={0}
            onClick={closeLightbox}
          >
            {/* Close button */}
            <button
              onClick={(e) => { e.stopPropagation(); closeLightbox(); }}
              className="fixed top-4 right-4 z-[100] w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white transition-colors backdrop-blur-md"
            >
              <X size={20} />
            </button>

            {/* Download button */}
            {!isCurrentGif && currentItem.type !== 'video' && (
              <a
                href={currentItem.url}
                download={currentItem.filename || 'image'}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
                className="fixed top-4 right-16 z-[100] w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white transition-colors backdrop-blur-md"
              >
                <Download size={18} />
              </a>
            )}

            {/* GIF favorite button */}
            {isCurrentGif && onFavoriteGif && (
              <button
                onClick={(e) => { e.stopPropagation(); onFavoriteGif(currentItem.url); }}
                className="fixed top-4 right-16 z-[100] w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white transition-colors backdrop-blur-md"
              >
                <Star size={18} className={favoriteGifs.includes(currentItem.url) ? 'text-yellow-400 fill-yellow-400' : 'text-white'} />
              </button>
            )}

            {/* Navigation arrows — desktop only */}
            {totalMedia.length > 1 && (
              <>
                <button
                  onClick={(e) => { e.stopPropagation(); goPrev(); }}
                  className="hidden md:flex fixed left-4 top-1/2 -translate-y-1/2 z-[100] w-12 h-12 rounded-full bg-white/10 hover:bg-white/20 items-center justify-center text-white transition-colors backdrop-blur-md"
                >
                  <ChevronLeft size={28} />
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); goNext(); }}
                  className="hidden md:flex fixed right-4 top-1/2 -translate-y-1/2 z-[100] w-12 h-12 rounded-full bg-white/10 hover:bg-white/20 items-center justify-center text-white transition-colors backdrop-blur-md"
                >
                  <ChevronRight size={28} />
                </button>
              </>
            )}

            {/* Counter */}
            {totalMedia.length > 1 && (
              <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[100] px-4 py-1.5 rounded-full bg-white/10 text-white text-sm font-medium backdrop-blur-md">
                {lightboxIndex + 1} / {totalMedia.length}
              </div>
            )}

            {/* Media — click/touch stopPropagation so it doesn't close */}
            <div
              className="relative z-[99] flex items-center justify-center w-full h-full"
              onClick={(e) => e.stopPropagation()}
              onTouchStart={(e) => { touchStartX.current = e.touches[0].clientX; }}
              onTouchMove={(e) => {
                const dx = e.touches[0].clientX - touchStartX.current;
                if (Math.abs(dx) > 15) setSwipeX(dx);
              }}
              onTouchEnd={() => {
                if (swipeX > 60) goPrev();
                else if (swipeX < -60) goNext();
                setSwipeX(0);
              }}
            >
              <motion.div
                key={lightboxIndex}
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                transition={{ duration: 0.15 }}
                className="bg-zinc-900 rounded-2xl overflow-hidden shadow-2xl"
                style={{ maxWidth: '90vw', maxHeight: '90vh', transform: `translateX(${swipeX * 0.4}px)`, transition: swipeX ? 'none' : 'transform 0.2s' }}
              >
                {currentItem.type === 'video' ? (
                  <video src={currentItem.url} controls autoPlay className="max-w-[90vw] max-h-[90vh]" />
                ) : (
                  <img
                    src={currentItem.url}
                    alt=""
                    className="max-w-[90vw] max-h-[90vh] object-contain select-none"
                  />
                )}
              </motion.div>
            </div>
          </motion.div>
        </AnimatePresence>,
        document.body
      )}

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
        <video src={item.url} preload="none" className="w-full h-full object-contain bg-black" />
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
        loading="lazy"
        decoding="async"
        className="w-full h-full object-cover cursor-pointer hover:brightness-90 transition-all"
        onClick={onClick}
        style={gif ? { imageRendering: 'auto' } : undefined}
      />
      {gif && onFavoriteGif && (
        <button
          onClick={(e) => { e.stopPropagation(); onClick(); onFavoriteGif(item.url); }}
          className="absolute top-1.5 left-1.5 p-1 rounded-full bg-black/70 hover:bg-black/90 z-10 opacity-0 group-hover:opacity-100 transition-opacity"
          title={favoriteGifs.includes(item.url) ? 'Удалить из избранного' : 'В избранное'}
        >
          <Star size={13} className={favoriteGifs.includes(item.url) ? 'text-yellow-400 fill-yellow-400' : 'text-white'} />
        </button>
      )}
    </div>
  );
}
