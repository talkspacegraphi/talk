import { useState, useEffect, useRef } from 'react';
import { Search, Loader2 } from 'lucide-react';
import { useLang } from '../lib/i18n';

interface GifPickerProps {
  onSelect: (gifUrl: string) => void;
  onClose: () => void;
}

const KLIPPY_API_KEY = 'C7ZXYIhC2TGt2m68ZsG7GmZt4Fgs4bAUpg3TqcR2d5z6Db1BJW71CFXFObJzgKKG';
const KLIPPY_API_URL = 'https://api.klippy.com/v1';

interface KlippyGif {
  id: string;
  url: string;
  preview: string;
  title: string;
}

export default function GifPicker({ onSelect, onClose }: GifPickerProps) {
  const { t } = useLang();
  const [search, setSearch] = useState('');
  const [gifs, setGifs] = useState<KlippyGif[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    // Загружаем trending гифки при открытии
    fetchGifs('trending');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }

    if (search.trim()) {
      searchTimeoutRef.current = setTimeout(() => {
        fetchGifs(search);
      }, 500);
    } else {
      fetchGifs('trending');
    }

    return () => {
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  const fetchGifs = async (query: string) => {
    setLoading(true);
    setError(null);

    try {
      const endpoint = query === 'trending' ? '/gifs/trending' : '/gifs/search';
      const params = new URLSearchParams({
        key: KLIPPY_API_KEY,
        limit: '30',
        ...(query !== 'trending' && { q: query }),
      });

      const response = await fetch(`${KLIPPY_API_URL}${endpoint}?${params}`);

      if (!response.ok) {
        throw new Error('Failed to fetch GIFs');
      }

      const data = await response.json();

      // Преобразуем ответ Klippy в наш формат
      const formattedGifs: KlippyGif[] = (data.results || []).map((gif: any) => ({
        id: gif.id,
        url: gif.media?.[0]?.gif?.url || gif.url,
        preview: gif.media?.[0]?.tinygif?.url || gif.media?.[0]?.gif?.url || gif.url,
        title: gif.title || '',
      }));

      setGifs(formattedGifs);
    } catch (err) {
      console.error('Error fetching GIFs:', err);
      setError('Failed to load GIFs');
      setGifs([]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="absolute bottom-full left-0 mb-2 w-80 h-96 bg-surface-secondary/95 glass-strong rounded-2xl shadow-2xl border border-white/10 flex flex-col overflow-hidden">
      {/* Header */}
      <div className="p-3 border-b border-white/10">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" size={16} />
          <input
            type="text"
            placeholder={t('searchGifs') || 'Search GIFs...'}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-black/20 border border-white/10 rounded-lg py-2 pl-9 pr-3 text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-vortex-500 transition-colors"
            autoFocus
          />
        </div>
      </div>

      {/* GIF Grid */}
      <div className="flex-1 overflow-y-auto p-2 custom-scrollbar">
        {loading && (
          <div className="flex items-center justify-center h-full">
            <Loader2 className="animate-spin text-vortex-400" size={32} />
          </div>
        )}

        {error && (
          <div className="flex items-center justify-center h-full text-red-400 text-sm">
            {error}
          </div>
        )}

        {!loading && !error && gifs.length === 0 && (
          <div className="flex items-center justify-center h-full text-zinc-500 text-sm">
            {t('nothingFound') || 'No GIFs found'}
          </div>
        )}

        {!loading && !error && gifs.length > 0 && (
          <div className="grid grid-cols-2 gap-2">
            {gifs.map((gif) => (
              <button
                key={gif.id}
                onClick={() => {
                  onSelect(gif.url);
                  onClose();
                }}
                className="relative aspect-square rounded-lg overflow-hidden hover:ring-2 hover:ring-vortex-500 transition-all group"
              >
                <img
                  src={gif.preview}
                  alt={gif.title}
                  className="w-full h-full object-cover"
                  loading="lazy"
                />
                <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors" />
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="p-2 border-t border-white/10 text-center">
        <span className="text-xs text-zinc-500">Powered by Klippy</span>
      </div>
    </div>
  );
}
