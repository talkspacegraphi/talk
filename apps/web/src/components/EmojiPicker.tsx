import { useState, useRef, useEffect, useCallback, memo } from 'react';
import { Search, X, TrendingUp, Star, Loader2 } from 'lucide-react';
import { useLang } from '../lib/i18n';

interface EmojiPickerProps {
  onSelect: (emoji: string) => void;
  onSelectGif?: (url: string) => void;
  onClose: () => void;
}

const GIPHY_API_KEY = 'sXpGFDGZs0Dv1mmNFvYaGUvYwKX0PWIh';
const GIPHY_API_URL = 'https://api.giphy.com/v1/gifs';
const FAVORITES_KEY = 'vortex_favorite_gifs';
const FREQUENT_KEY = 'vortex_frequent_emojis';

interface KlippyGif { id: string; url: string; preview: string; title: string; }

function getFavoriteGifs(): KlippyGif[] {
  try { return JSON.parse(localStorage.getItem(FAVORITES_KEY) || '[]'); } catch { return []; }
}
function saveFavoriteGifs(gifs: KlippyGif[]) { localStorage.setItem(FAVORITES_KEY, JSON.stringify(gifs)); }
function toggleFavoriteGif(gif: KlippyGif) {
  const f = getFavoriteGifs();
  const i = f.findIndex(x => x.id === gif.id);
  if (i >= 0) f.splice(i, 1); else f.unshift(gif);
  saveFavoriteGifs(f);
  return i < 0;
}

function getFrequentEmojis(): string[] {
  try { return JSON.parse(localStorage.getItem(FREQUENT_KEY) || '[]'); } catch { return []; }
}
function saveFrequentEmoji(emoji: string) {
  const list = getFrequentEmojis().filter(e => e !== emoji);
  list.unshift(emoji);
  if (list.length > 36) list.length = 36;
  localStorage.setItem(FREQUENT_KEY, JSON.stringify(list));
}

const EMOJI_CATEGORIES = [
  { id: 'frequent', label: '🕐', emojis: ['😀','😂','🥹','😍','🥺','😎','🤩','🥳','😭','🔥','❤️','👍','👎','💀','🙏','✨','🤔','😏','🫡','🤝','💪','🎉','🫶','😘','🤮','🫠','🥲','😤','😈','🤡','👻','💯','⭐'] },
  { id: 'smileys', label: '😀', emojis: ['😀','😃','😄','😁','😆','😅','🤣','😂','🙂','🙃','😉','😊','😇','🥰','😍','🤩','😘','😗','😚','😙','🥲','😋','😛','😜','🤪','😝','🤑','🤗','🤭','🫢','🫣','🤫','🤔','🫡','🤐','🤨','😐','😑','😶','🫥','😏','😒','🙄','😬','🤥','😌','😔','😪','🤤','😴','😷','🤒','🤕','🤢','🤮','🥵','🥶','🥴','😵','🤯','🤠','🥳','🥸','😎','🤓','🧐','😕','🫤','😟','🙁','😮','😯','😲','😳','🥺','🥹','😦','😧','😨','😰','😥','😢','😭','😱','😖','😣','😞','😓','😩','😫','🥱','😤','😡','😠','🤬','😈','👿','💀','☠️','💩','🤡','👹','👺','👻','👽','👾','🤖'] },
  { id: 'gestures', label: '👋', emojis: ['👋','🤚','🖐️','✋','🖖','👌','🤌','🤏','✌️','🤞','🤟','🤘','🤙','👈','👉','👆','🖕','👇','☝️','👍','👎','✊','👊','🤛','🤜','👏','🙌','🫶','👐','🤲','🤝','🙏','💪'] },
  { id: 'animals', label: '🐶', emojis: ['🐶','🐱','🐭','🐹','🐰','🦊','🐻','🐼','🐨','🐯','🦁','🐮','🐷','🐸','🐵','🙈','🙉','🙊','🐒','🐔','🐧','🐦','🐤','🐣','🦆','🦅','🦉','🦇','🐺','🐴','🦄','🐝','🦋','🐌','🐞','🐢','🐍','🦎','🐙','🦑','🦐','🦞','🦀','🐡','🐠','🐟','🐬','🐳','🐋','🦈','🐊','🐅','🐆','🦍','🐘','🐪','🐫','🦒','🦘','🐕','🐩','🐈'] },
  { id: 'food', label: '🍕', emojis: ['🍎','🍐','🍊','🍋','🍌','🍉','🍇','🍓','🫐','🍒','🍑','🥭','🍍','🥥','🥝','🍅','🍆','🥑','🥦','🥒','🌶️','🌽','🥕','🧄','🧅','🥔','🍞','🥖','🧀','🥚','🍳','🥞','🥓','🥩','🍗','🍖','🌭','🍔','🍟','🍕','🥪','🌮','🌯','🥗','🥘','🍝','🍜','🍲','🍛','🍣','🍱','🥟','🍙','🍚','🍥','🍡','🍧','🍨','🍦','🥧','🧁','🍰','🎂','🍭','🍬','🍫','🍿','🍩','🍪','🌰','🥜','🍯','🥛','☕','🍵','🥤','🍺','🍻','🥂','🍷','🥃','🍸','🍹','🍾'] },
  { id: 'travel', label: '✈️', emojis: ['🚗','🚕','🚙','🚌','🏎️','🚓','🚑','🚒','🚐','🚚','🚛','🚜','🏍️','🛵','🚲','🛴','🛹','⛽','⛵','🚤','🛳️','🚢','✈️','🛩️','🛫','🛬','🚁','🚀','🛸','🌍','🌎','🗺️','🧭','🏔️','⛰️','🌋','🗻','🏕️','🏖️','🏝️','🏟️','🏛️','🏠','🏡','🏢','🏣','🏥','🏦','🏨','🏪','🏫','🏭','🏰','🗼','🗽','⛪','🕌','⛲','🌃','🌅','🌇','🌉','🌌'] },
  { id: 'activities', label: '⚽', emojis: ['⚽','🏀','🏈','⚾','🎾','🏐','🏉','🎱','🏓','🏸','🏒','🏏','⛳','🏹','🎣','🥊','🎯','🎮','🕹️','🎰','🎲','🧩','🧸','🪅','🪩','♠️','♥️','♦️','♣️','♟️','🃏','🀄','🎴','🎭','🎨','🧵','🧶','🎵','🎶','🎙️','🎤','🎧','📻','🎷','🎸','🎹','🎺','🎻','🥁','💻','⌨️','🖥️','🖨️','📷','📸','📹','🎥','🎬'] },
  { id: 'objects', label: '💡', emojis: ['⌚','📱','💻','⌨️','🖥️','🖱️','💾','💿','📀','🧮','🔍','🔬','🔭','📡','💊','💉','🩹','🪑','🚿','🛁','🧴','🧹','🧻','🪣','🧼','🛒','🔑','🗝️','🚪','🛏️','🪞','🧳','🧲','🪜','💣','🧨','🪓','🔪','🗡️','⚔️','🛡️','🧲','🔮','📿','🧿','⚗️','🕳️'] },
  { id: 'symbols', label: '❤️', emojis: ['❤️','🧡','💛','💚','💙','💜','🖤','🤍','🤎','💔','❤️‍🔥','❣️','💕','💞','💓','💗','💖','💘','💝','💟','☮️','✝️','☪️','🕉️','☸️','✡️','☯️','♈','♉','♊','♋','♌','♍','♎','♏','♐','♑','♒','♓','🆔','⚛️','🉑','☢️','📶','🔣','ℹ️','🔤','🔡','🔠',' NG','🆗','🆙','🆒','🆕','🆓','0️⃣','1️⃣','2️⃣','3️⃣','4️⃣','5️⃣','6️⃣','7️⃣','8️⃣','9️⃣','🔟','🔢','#️⃣','*️⃣','▶️','⏸️','⏹️','⏭️','⏪','⏩','🔼','🔽','➡️','⬅️','⬆️','⬇️','↗️','↘️','↙️','↖️','↔️','🔀','🔁','🔄','➕','➖','➗','✖️','♾️','💲','™️','©️','®️','✔️','☑️','🔘','🔴','🟠','🟡','🟢','🔵','🟣','⚫','⚪','🟤','🔺','🔻','🔸','🔹','🔶','🔷','🔳','🔲','▪️','▫️','◾','◽','◼️','◻️','🟥','🟧','🟨','🟩','🟦','🟪','⬛','⬜','🟫','🔇','🔉','🔊','🔔','🔕','📣','📢'] },
  { id: 'flags', label: '🏁', emojis: ['🏁','🚩','🎌','🏴','🏳️','🏳️‍🌈','🏳️‍⚧️','🏴‍☠️','🇺🇸','🇬🇧','🇩🇪','🇫🇷','🇮🇹','🇪🇸','🇵🇹','🇷🇺','🇺🇦','🇨🇳','🇯🇵','🇰🇷','🇮🇳','🇧🇷','🇲🇽','🇨🇦','🇦🇺','🇦🇷','🇹🇷','🇸🇦','🇦🇪','🇮🇱','🇹🇭','🇻🇳','🇵🇭','🇮🇩','🇲🇾','🇸🇬','🇳🇬','🇿🇦','🇪🇬','🇰🇪','🇬🇷','🇳🇱','🇧🇪','🇨🇭','🇦🇹','🇸🇪','🇳🇴','🇩🇰','🇫🇮','🇵🇱','🇨🇿','🇷🇴','🇭🇺','🇧🇬','🇭🇷','🇷🇸','🇺🇿','🇰🇿','🇰🇬','🇹🇯','🇹🇲','🇦🇲','🇦🇿','🇬🇪'] },
];

const EmojiPicker = memo(function EmojiPicker({ onSelect, onSelectGif, onClose }: EmojiPickerProps) {
  const { t, lang } = useLang();
  const [tab, setTab] = useState<'emoji' | 'gif'>('emoji');
  const [search, setSearch] = useState('');
  const [activeCategory, setActiveCategory] = useState('frequent');
  const searchRef = useRef<HTMLInputElement>(null);

  // GIF state
  const [gifTab, setGifTab] = useState<'trending' | 'favorites' | null>(null);
  const [gifQuery, setGifQuery] = useState('');
  const [gifs, setGifs] = useState<KlippyGif[]>([]);
  const [trendingGifs, setTrendingGifs] = useState<KlippyGif[]>([]);
  const [favoriteGifs, setFavoriteGifs] = useState<KlippyGif[]>(getFavoriteGifs());
  const [gifLoading, setGifLoading] = useState(false);
  const [offset, setOffset] = useState(0);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (gifTab === 'trending' && trendingGifs.length === 0) loadMoreGifs(true);
    if (scrollRef.current) scrollRef.current.scrollTop = 0;
  }, [gifTab]);

  const loadMoreGifs = async (reset = false) => {
    if (gifLoading) return;
    const currentOffset = reset ? 0 : offset;
    setGifLoading(true);
    try {
      const endpoint = gifQuery.trim() ? 'search' : 'trending';
      const params = new URLSearchParams({ api_key: GIPHY_API_KEY, limit: '10', offset: currentOffset.toString(), rating: 'g', ...(gifQuery.trim() && { q: gifQuery }) });
      const resp = await fetch(`${GIPHY_API_URL}/${endpoint}?${params}`);
      const d = await resp.json();
      const formatted = (d.data || []).map((gif: any) => ({ id: gif.id, url: gif.images.original.url, preview: gif.images.fixed_width_small.url, title: gif.title || '' }));
      if (reset) {
        if (gifQuery.trim()) setGifs(formatted); else setTrendingGifs(formatted);
        setOffset(10);
      } else {
        if (gifQuery.trim()) setGifs(prev => [...prev, ...formatted]); else setTrendingGifs(prev => [...prev, ...formatted]);
        setOffset(prev => prev + 10);
      }
    } catch (err) { console.error('GIF load error:', err); } finally { setGifLoading(false); }
  };

  const handleGifSearch = (q: string) => {
    setGifQuery(q);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => { setOffset(0); loadMoreGifs(true); }, 400);
  };

  const handleGifScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const t = e.currentTarget;
    if (t.scrollHeight - t.scrollTop <= t.clientHeight + 100 && !gifLoading && gifTab === 'trending' && !gifQuery.trim()) loadMoreGifs(false);
  };

  const frequentEmojis = getFrequentEmojis();

  const filteredEmojis = search.trim()
    ? EMOJI_CATEGORIES.flatMap(c => c.emojis).filter((_, i) => true) // search is below
    : null;

  const displayGifs = gifQuery.trim() ? gifs : trendingGifs;

  return (
    <div
      className="rounded-2xl shadow-2xl border border-white/10 overflow-hidden max-w-[calc(100vw-16px)]"
      style={{ width: tab === 'gif' ? Math.min(480, window.innerWidth - 16) : Math.min(352, window.innerWidth - 16), background: 'rgb(17, 17, 19)', maxHeight: '60vh' }}
      onClick={(e) => e.stopPropagation()}
    >
      {/* Tabs */}
      <div className="flex border-b border-white/10">
        <button onClick={() => setTab('emoji')} className={`flex-1 py-2.5 text-xs font-semibold tracking-wide transition-colors ${tab === 'emoji' ? 'text-white border-b-2 border-accent' : 'text-zinc-500 hover:text-zinc-300'}`}>
          EMOJI
        </button>
        <button onClick={() => { setTab('gif'); setTimeout(() => searchRef.current?.focus(), 100); }} className={`flex-1 py-2.5 text-xs font-semibold tracking-wide transition-colors ${tab === 'gif' ? 'text-white border-b-2 border-accent' : 'text-zinc-500 hover:text-zinc-300'}`}>
          GIF
        </button>
      </div>

      {tab === 'emoji' && (
        <>
          {/* Search */}
          <div className="p-2 border-b border-white/10">
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
              <input
                ref={searchRef}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={lang === 'ru' ? 'Поиск...' : 'Search...'}
                className="w-full pl-8 pr-8 py-2 rounded-lg bg-surface-tertiary/80 text-sm text-white placeholder-zinc-500 border border-border/30 focus:border-accent/50 outline-none transition-colors"
              />
              {search && (
                <button onClick={() => { setSearch(''); searchRef.current?.focus(); }} className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-white">
                  <X size={14} />
                </button>
              )}
            </div>
          </div>

          {/* Category tabs */}
          {!search && (
            <div className="flex border-b border-white/10 px-1 py-1 gap-0.5 overflow-x-auto scrollbar-hide">
              {EMOJI_CATEGORIES.map((cat) => (
                <button
                  key={cat.id}
                  onClick={() => setActiveCategory(cat.id)}
                  className={`flex-shrink-0 w-9 h-9 rounded-lg flex items-center justify-center text-lg transition-all ${activeCategory === cat.id ? 'bg-white/15 scale-110' : 'hover:bg-white/10'}`}
                >
                  {cat.label}
                </button>
              ))}
            </div>
          )}

          {/* Emoji grid */}
          <div ref={scrollRef} className="overflow-y-auto" style={{ maxHeight: 'min(320px, 50vh)' }}>
            {search.trim() ? (
              <div className="p-2">
                <div className="grid grid-cols-9 gap-0.5">
                  {EMOJI_CATEGORIES.flatMap(c => c.emojis).filter((e, i, arr) => arr.indexOf(e) === i && e.includes(search)).map((emoji, i) => (
                    <button key={`s-${i}`} onClick={() => { saveFrequentEmoji(emoji); onSelect(emoji); }} className="w-9 h-9 flex items-center justify-center text-xl hover:bg-white/10 rounded-lg transition-colors active:scale-90">
                      {emoji}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <>
                <div className="p-2">
                  <p className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider mb-1 px-1">🕐 {lang === 'ru' ? 'Недавние' : 'Recent'}</p>
                  <div className="grid grid-cols-9 gap-0.5">
                    {frequentEmojis.length > 0 ? frequentEmojis.slice(0, 36).map((emoji, i) => (
                      <button key={`freq-${i}`} onClick={() => { saveFrequentEmoji(emoji); onSelect(emoji); }} className="w-9 h-9 flex items-center justify-center text-xl hover:bg-white/10 rounded-lg transition-colors active:scale-90">
                        {emoji}
                      </button>
                    )) : EMOJI_CATEGORIES[0].emojis.map((emoji, i) => (
                      <button key={`def-${i}`} onClick={() => { saveFrequentEmoji(emoji); onSelect(emoji); }} className="w-9 h-9 flex items-center justify-center text-xl hover:bg-white/10 rounded-lg transition-colors active:scale-90">
                        {emoji}
                      </button>
                    ))}
                  </div>
                </div>
                {EMOJI_CATEGORIES.filter(c => c.id !== 'frequent' && (!activeCategory || c.id === activeCategory)).map((cat) => (
                  <div key={cat.id} className="p-2">
                    <p className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider mb-1 px-1">{cat.label} {cat.id}</p>
                    <div className="grid grid-cols-9 gap-0.5">
                      {cat.emojis.map((emoji, i) => (
                        <button key={`${cat.id}-${i}`} onClick={() => { saveFrequentEmoji(emoji); onSelect(emoji); }} className="w-9 h-9 flex items-center justify-center text-xl hover:bg-white/10 rounded-lg transition-colors active:scale-90">
                          {emoji}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </>
            )}
          </div>
        </>
      )}

      {tab === 'gif' && (
        <div className="flex flex-col h-[380px]">
          <div className="flex border-b border-white/10">
            {gifTab !== null && (
              <button onClick={() => setGifTab(null)} className="px-4 py-3 text-zinc-400 hover:text-white transition-colors border-r border-white/10">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6" /></svg>
              </button>
            )}
            <button onClick={() => { setGifTab('trending'); setGifQuery(''); }} className={`flex-1 py-3.5 text-sm font-semibold tracking-wide transition-colors ${gifTab === 'trending' ? 'text-white border-b-2 border-vortex-500' : 'text-zinc-500 hover:text-zinc-300'}`}>
              <div className="flex items-center justify-center gap-2"><TrendingUp size={18} /><span>{lang === 'ru' ? 'ПОПУЛЯРНЫЕ' : 'TRENDING'}</span></div>
            </button>
            <button onClick={() => { setGifTab('favorites'); setGifQuery(''); }} className={`flex-1 py-3.5 text-sm font-semibold tracking-wide transition-colors ${gifTab === 'favorites' ? 'text-white border-b-2 border-vortex-500' : 'text-zinc-500 hover:text-zinc-300'}`}>
              <div className="flex items-center justify-center gap-2"><Star size={18} className={gifTab === 'favorites' ? 'fill-yellow-500 text-yellow-500' : ''} /><span>{lang === 'ru' ? 'ИЗБРАННЫЕ' : 'FAVORITES'}</span></div>
            </button>
          </div>

          {gifTab === null ? (
            <div className="flex-1 flex items-center justify-center text-zinc-500 text-sm">{lang === 'ru' ? 'Выберите вкладку' : 'Select a tab'}</div>
          ) : (
            <>
              {gifTab === 'trending' && (
                <div className="p-2">
                  <div className="relative">
                    <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
                    <input ref={searchRef} value={gifQuery} onChange={(e) => handleGifSearch(e.target.value)} placeholder={t('searchGifs')} className="w-full pl-8 pr-3 py-2 rounded-lg bg-surface-tertiary/80 text-sm text-white placeholder-zinc-500 border border-border/30 focus:border-accent/50 outline-none transition-colors" />
                  </div>
                </div>
              )}
              <div ref={scrollRef} className="flex-1 overflow-y-auto p-2" onScroll={handleGifScroll}>
                {gifTab === 'favorites' ? (
                  favoriteGifs.length === 0 ? (
                    <p className="text-center text-xs text-zinc-500 py-10">{lang === 'ru' ? 'Нет избранных гифок' : 'No favorite GIFs'}</p>
                  ) : (
                    <div className="columns-2 gap-1.5">
                      {favoriteGifs.map((gif) => (
                        <div key={gif.id} className="relative w-full mb-1.5 rounded-lg overflow-hidden">
                          <button onClick={() => { onSelectGif?.(gif.url); onClose(); }} className="w-full hover:opacity-80 transition-opacity block">
                            <img src={gif.preview} alt={gif.title} className="w-full h-auto rounded-lg" loading="lazy" />
                          </button>
                          <button onClick={(e) => { e.stopPropagation(); toggleFavoriteGif(gif); setFavoriteGifs(getFavoriteGifs()); }} className="absolute top-2 left-2 p-1.5 rounded-full bg-black/70 hover:bg-black/90 z-10" title={lang === 'ru' ? 'Удалить из избранного' : 'Remove from favorites'}>
                            <Star size={16} className="text-yellow-400 fill-yellow-400" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )
                ) : (
                  <>
                    {gifLoading && displayGifs.length === 0 ? (
                      <div className="flex items-center justify-center py-10"><Loader2 size={24} className="text-zinc-500 animate-spin" /></div>
                    ) : displayGifs.length === 0 ? (
                      <p className="text-center text-xs text-zinc-500 py-10">{t('nothingFound')}</p>
                    ) : (
                      <>
                        <div className="columns-2 gap-1.5">
                          {displayGifs.map((gif) => (
                            <div key={gif.id} className="relative w-full mb-1.5 rounded-lg overflow-hidden group">
                              <button onClick={() => { onSelectGif?.(gif.url); onClose(); }} className="w-full hover:opacity-80 transition-opacity block">
                                <img src={gif.preview} alt={gif.title} className="w-full h-auto rounded-lg" loading="lazy" />
                              </button>
                              <button onClick={(e) => { e.stopPropagation(); toggleFavoriteGif(gif); setFavoriteGifs(getFavoriteGifs()); }} className="absolute top-2 left-2 p-1.5 rounded-full bg-black/70 hover:bg-black/90 z-10 transition-opacity" title={lang === 'ru' ? 'В избранное' : 'Add to favorites'}>
                                <Star size={16} className={getFavoriteGifs().some(f => f.id === gif.id) ? 'text-yellow-400 fill-yellow-400' : 'text-white'} />
                              </button>
                            </div>
                          ))}
                        </div>
                        {gifLoading && <div className="flex items-center justify-center py-4"><Loader2 size={20} className="text-zinc-500 animate-spin" /></div>}
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
  );
});

export default EmojiPicker;
