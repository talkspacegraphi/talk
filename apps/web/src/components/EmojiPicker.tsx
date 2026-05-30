import { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import Picker from '@emoji-mart/react';
import data from '@emoji-mart/data';
import { Search, TrendingUp, Loader2, Star } from 'lucide-react';
import { useLang } from '../lib/i18n';

interface KlippyGif {
  id: string;
  url: string;
  preview: string;
  title: string;
}

interface EmojiPickerProps {
  onSelect: (emoji: string) => void;
  onSelectGif?: (url: string, preview: string) => void;
  onClose: () => void;
}

// Используем публичный beta ключ Giphy
const GIPHY_API_KEY = 'sXpGFDGZs0Dv1mmNFvYaGUvYwKX0PWIh';
const GIPHY_API_URL = 'https://api.giphy.com/v1/gifs';
const FAVORITES_KEY = 'vortex_favorite_gifs';

const getFavoriteGifs = (): KlippyGif[] => {
  try {
    const stored = localStorage.getItem(FAVORITES_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch {
    return [];
  }
};

const saveFavoriteGifs = (gifs: KlippyGif[]) => {
  localStorage.setItem(FAVORITES_KEY, JSON.stringify(gifs));
};

const toggleFavorite = (gif: KlippyGif) => {
  const favorites = getFavoriteGifs();
  const index = favorites.findIndex(f => f.id === gif.id);
  if (index >= 0) {
    favorites.splice(index, 1);
  } else {
    favorites.unshift(gif);
  }
  saveFavoriteGifs(favorites);
  return index < 0;
};

const isFavorite = (gifId: string) => {
  return getFavoriteGifs().some(f => f.id === gifId);
};

export default function EmojiPicker({ onSelect, onSelectGif, onClose }: EmojiPickerProps) {
  const { lang, t } = useLang();
  const [tab, setTab] = useState<'emoji' | 'gif'>('emoji');
  const [gifTab, setGifTab] = useState<'trending' | 'favorites' | null>(null);
  const [gifQuery, setGifQuery] = useState('');
  const [gifs, setGifs] = useState<KlippyGif[]>([]);
  const [gifLoading, setGifLoading] = useState(false);
  const [trendingGifs, setTrendingGifs] = useState<KlippyGif[]>([]);
  const [favoriteGifs, setFavoriteGifs] = useState<KlippyGif[]>(getFavoriteGifs());
  const [offset, setOffset] = useState(0);
  const gifSearchRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Load trending GIFs from Giphy only when tab is selected
  useEffect(() => {
    if (gifTab === 'trending' && trendingGifs.length === 0) {
      loadMoreGifs(true);
    }
    // Reset scroll position when switching tabs
    if (scrollRef.current) {
      scrollRef.current.scrollTop = 0;
    }
  }, [gifTab]);

  const loadMoreGifs = async (reset = false) => {
    if (gifLoading) return;

    const currentOffset = reset ? 0 : offset;
    setGifLoading(true);

    try {
      const endpoint = gifQuery.trim() ? 'search' : 'trending';
      const params = new URLSearchParams({
        api_key: GIPHY_API_KEY,
        limit: '10',
        offset: currentOffset.toString(),
        rating: 'g',
        ...(gifQuery.trim() && { q: gifQuery }),
      });

      const response = await fetch(`${GIPHY_API_URL}/${endpoint}?${params}`);
      const d = await response.json();

      const formatted = (d.data || []).map((gif: any) => ({
        id: gif.id,
        url: gif.images.original.url,
        preview: gif.images.fixed_width_small.url,
        title: gif.title || '',
      }));

      if (reset) {
        if (gifQuery.trim()) {
          setGifs(formatted);
        } else {
          setTrendingGifs(formatted);
        }
        setOffset(10);
      } else {
        if (gifQuery.trim()) {
          setGifs(prev => [...prev, ...formatted]);
        } else {
          setTrendingGifs(prev => [...prev, ...formatted]);
        }
        setOffset(prev => prev + 10);
      }
    } catch (err) {
      console.error('Failed to load GIFs:', err);
    } finally {
      setGifLoading(false);
    }
  };

  const searchGifs = useCallback((q: string) => {
    setOffset(0);
    loadMoreGifs(true);
  }, []);

  const handleGifSearch = (q: string) => {
    setGifQuery(q);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => searchGifs(q), 400);
  };

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const target = e.currentTarget;
    const bottom = target.scrollHeight - target.scrollTop <= target.clientHeight + 100;

    if (bottom && !gifLoading && gifTab === 'trending' && !gifQuery.trim()) {
      loadMoreGifs(false);
    }
  };

  const pickGif = (gif: KlippyGif) => {
    if (onSelectGif && gif.url) {
      onSelectGif(gif.url, gif.preview);
    }
  };

  const handleToggleFavorite = (gif: KlippyGif, e: React.MouseEvent) => {
    e.stopPropagation();
    toggleFavorite(gif);
    setFavoriteGifs(getFavoriteGifs());
  };

  const displayGifs = gifQuery.trim() ? gifs : trendingGifs;

  const anchorRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  useEffect(() => {
    const update = () => {
      const el = anchorRef.current?.parentElement;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const w = tab === 'gif' ? 480 : 352;
      let left = rect.right - w;
      if (left < 8) left = 8;
      setPos({ top: rect.top - 8, left });
    };
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, [tab]);

  const pickerWidth = tab === 'gif' ? 480 : 352;

  return (
    <>
      <div ref={anchorRef} className="hidden" />
      {createPortal(
        <>
          <div className="fixed inset-0 z-[9990]" onClick={onClose} />
          <div
            className="fixed z-[9991] rounded-2xl shadow-2xl border border-white/10"
            style={{
              width: pickerWidth,
              bottom: pos ? `${window.innerHeight - pos.top}px` : undefined,
              left: pos ? pos.left : undefined,
              background: 'rgb(17, 17, 19)',
              visibility: pos ? 'visible' : 'hidden',
            }}
          >
        {/* Tabs */}
        <div className="flex border-b border-white/10">
          <button
            onClick={() => setTab('emoji')}
            className={`flex-1 py-2.5 text-xs font-semibold tracking-wide transition-colors ${tab === 'emoji' ? 'text-white border-b-2 border-accent' : 'text-zinc-500 hover:text-zinc-300'}`}
          >
            EMOJI
          </button>
          <button
            onClick={() => { setTab('gif'); setTimeout(() => gifSearchRef.current?.focus(), 100); }}
            className={`flex-1 py-2.5 text-xs font-semibold tracking-wide transition-colors ${tab === 'gif' ? 'text-white border-b-2 border-accent' : 'text-zinc-500 hover:text-zinc-300'}`}
          >
            GIF
          </button>
        </div>

        {/* Emoji tab */}
        {tab === 'emoji' && (
          <Picker
            data={data}
            onEmojiSelect={(e: { native: string }) => onSelect(e.native)}
            theme="dark"
            locale={lang === 'ru' ? 'ru' : 'en'}
            set="native"
            previewPosition="none"
            skinTonePosition="search"
            perLine={9}
            emojiSize={28}
            emojiButtonSize={36}
            maxFrequentRows={2}
            navPosition="bottom"
            dynamicWidth={false}
          />
        )}

        {/* GIF tab */}
        {tab === 'gif' && (
          <div className="flex flex-col h-[380px]">
            {/* Sub-tabs for Favorites and Trending */}
            <div className="flex border-b border-white/10">
              {gifTab !== null && (
                <button
                  onClick={() => setGifTab(null)}
                  className="px-4 py-3 text-zinc-400 hover:text-white transition-colors border-r border-white/10"
                >
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="15 18 9 12 15 6" />
                  </svg>
                </button>
              )}
              <button
                onClick={() => {
                  setGifTab('trending');
                  setGifQuery('');
                }}
                className={`flex-1 py-3.5 text-sm font-semibold tracking-wide transition-colors ${gifTab === 'trending' ? 'text-white border-b-2 border-vortex-500' : 'text-zinc-500 hover:text-zinc-300'}`}
              >
                <div className="flex items-center justify-center gap-2">
                  <TrendingUp size={18} />
                  <span>ПОПУЛЯРНЫЕ</span>
                </div>
              </button>
              <button
                onClick={() => {
                  setGifTab('favorites');
                  setGifQuery('');
                }}
                className={`flex-1 py-3.5 text-sm font-semibold tracking-wide transition-colors ${gifTab === 'favorites' ? 'text-white border-b-2 border-vortex-500' : 'text-zinc-500 hover:text-zinc-300'}`}
              >
                <div className="flex items-center justify-center gap-2">
                  <Star size={18} className={gifTab === 'favorites' ? 'fill-yellow-500 text-yellow-500' : ''} />
                  <span>ИЗБРАННЫЕ</span>
                </div>
              </button>
            </div>

            {/* Content */}
            {gifTab === null ? (
              <div className="flex-1 flex items-center justify-center text-zinc-500 text-sm">
                Выберите вкладку
              </div>
            ) : (
              <>
                {/* Search only for trending */}
                {gifTab === 'trending' && (
                  <div className="p-2">
                    <div className="relative">
                      <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
                      <input
                        ref={gifSearchRef}
                        value={gifQuery}
                        onChange={(e) => handleGifSearch(e.target.value)}
                        placeholder={t('searchGifs')}
                        className="w-full pl-8 pr-3 py-2 rounded-lg bg-surface-tertiary/80 text-sm text-white placeholder-zinc-500 border border-border/30 focus:border-accent/50 outline-none transition-colors"
                      />
                    </div>
                  </div>
                )}

                <div
                  ref={scrollRef}
                  className="flex-1 overflow-y-auto p-2"
                  onScroll={handleScroll}
                >
                  {gifTab === 'favorites' ? (
                    favoriteGifs.length === 0 ? (
                      <p className="text-center text-xs text-zinc-500 py-10">Нет избранных гифок</p>
                    ) : (
                      <div className="columns-2 gap-1.5">
                        {favoriteGifs.map((gif) => (
                          <div
                            key={gif.id}
                            className="relative w-full mb-1.5 rounded-lg overflow-hidden"
                          >
                            <button
                              onClick={() => { pickGif(gif); onClose(); }}
                              className="w-full hover:opacity-80 transition-opacity block"
                            >
                              <img
                                src={gif.preview}
                                alt={gif.title}
                                className="w-full h-auto rounded-lg"
                                loading="lazy"
                              />
                            </button>
                            <button
                              onClick={(e) => handleToggleFavorite(gif, e)}
                              className="absolute top-2 left-2 p-1.5 rounded-full bg-black/70 hover:bg-black/90 z-10"
                              title="Удалить из избранного"
                            >
                              <Star size={16} className="text-yellow-400 fill-yellow-400" />
                            </button>
                          </div>
                        ))}
                      </div>
                    )
                  ) : (
                    <>
                      {gifLoading && displayGifs.length === 0 ? (
                        <div className="flex items-center justify-center py-10">
                          <Loader2 size={24} className="text-zinc-500 animate-spin" />
                        </div>
                      ) : displayGifs.length === 0 ? (
                        <p className="text-center text-xs text-zinc-500 py-10">{t('nothingFound')}</p>
                      ) : (
                        <>
                          <div className="columns-2 gap-1.5">
                            {displayGifs.map((gif) => (
                              <div
                                key={gif.id}
                                className="relative w-full mb-1.5 rounded-lg overflow-hidden group"
                              >
                                <button
                                  onClick={() => { pickGif(gif); onClose(); }}
                                  className="w-full hover:opacity-80 transition-opacity block"
                                >
                                  <img
                                    src={gif.preview}
                                    alt={gif.title}
                                    className="w-full h-auto rounded-lg"
                                    loading="lazy"
                                  />
                                </button>
<button
                              onClick={(e) => handleToggleFavorite(gif, e)}
                              className="absolute top-2 left-2 p-1.5 rounded-full bg-black/70 hover:bg-black/90 z-10 transition-opacity"
                              title={isFavorite(gif.id) ? 'Удалить из избранного' : 'В избранное'}
                            >
                              <Star
                                size={16}
                                className={isFavorite(gif.id) ? 'text-yellow-400 fill-yellow-400' : 'text-white'}
                              />
                            </button>
                              </div>
                            ))}
                          </div>
                          {gifLoading && (
                            <div className="flex items-center justify-center py-4">
                              <Loader2 size={20} className="text-zinc-500 animate-spin" />
                            </div>
                          )}
                        </>
                      )}
                    </>
                  )}
                </div>
              </>
            )}
          </div>
        )}
          </div>
        </>,
        document.body
      )}
    </>
  );
}
