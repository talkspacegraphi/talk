import { useState, useRef, useEffect, memo } from 'react';
import { Play, Pause, Download, Music, Volume2 } from 'lucide-react';
import { useVisibilityObserver } from '../../lib/hooks';
import type { MediaItem, Message } from '../../lib/types';

interface MessageAudioProps {
  media: MediaItem[];
  isMine: boolean;
  message: Message;
}

function MessageAudio({ media, isMine, message }: MessageAudioProps) {
  const audioMedia = media.find((m) => m.type === 'audio');
  if (!audioMedia) return null;

  const [isPlaying, setIsPlaying] = useState(false);
  const [audioProgress, setAudioProgress] = useState(0);
  const [audioDuration, setAudioDuration] = useState(0);
  const [audioVolume, setAudioVolume] = useState(() => {
    const stored = localStorage.getItem('vortex_audio_volume');
    return stored ? parseFloat(stored) : 0.7;
  });
  const [showVolumeSlider, setShowVolumeSlider] = useState(false);
  const [hoverTime, setHoverTime] = useState<number | null>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const isVisible = useVisibilityObserver(containerRef, '300px');

  const fileName = audioMedia.filename || 'Аудио';
  const nameWithoutExt = fileName.replace(/\.[^/.]+$/, '');
  const title = nameWithoutExt;
  const artist = isMine ? 'Вы' : message.sender?.displayName || message.sender?.username || 'Неизвестный исполнитель';
  const isMp3 = !!audioMedia.filename?.toLowerCase().endsWith('.mp3');

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const onTimeUpdate = () => {
      if (audio.duration) setAudioProgress((audio.currentTime / audio.duration) * 100);
    };
    const onLoadedMetadata = () => {
      setAudioDuration(audio.duration);
      audio.volume = audioVolume;
    };
    const onEnded = () => { setIsPlaying(false); setAudioProgress(0); };

    audio.addEventListener('timeupdate', onTimeUpdate);
    audio.addEventListener('loadedmetadata', onLoadedMetadata);
    audio.addEventListener('ended', onEnded);
    return () => {
      audio.removeEventListener('timeupdate', onTimeUpdate);
      audio.removeEventListener('loadedmetadata', onLoadedMetadata);
      audio.removeEventListener('ended', onEnded);
    };
  }, []);

  // Pause audio when scrolled off-screen to free resources
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !isPlaying) return;
    if (!isVisible) {
      audio.pause();
      setIsPlaying(false);
    }
  }, [isVisible, isPlaying]);

  const toggleAudio = () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (isPlaying) {
      audio.pause();
      setIsPlaying(false);
    } else {
      if (audio.readyState < 2) audio.load();
      audio.play().then(() => setIsPlaying(true)).catch(() => {
        audio.load();
        audio.play().then(() => setIsPlaying(true)).catch(console.error);
      });
    }
  };

  const handleSeek = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    if (audioRef.current) {
      audioRef.current.currentTime = pct * (audioDuration || 0);
      setAudioProgress(pct * 100);
    }
  };

  const handleVolumeChange = (vol: number) => {
    const audio = audioRef.current;
    if (audio) audio.volume = vol;
    setAudioVolume(vol);
    localStorage.setItem('vortex_audio_volume', vol.toString());
  };

  const formatDuration = (sec: number) => {
    if (!sec || isNaN(sec) || !isFinite(sec)) return '0:00';
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  const handleProgressHover = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    setHoverTime(pct * (audioDuration || 0));
  };

  return (
    <div
      ref={containerRef}
      className="w-full max-w-[280px] md:max-w-[320px] py-3 px-3 rounded-2xl bg-gradient-to-br from-purple-500/30 to-pink-500/20 border border-purple-400/30 hover:border-purple-400/50 transition-all duration-300 group overflow-hidden"
      onClick={e => e.stopPropagation()}
      onTouchStart={e => e.stopPropagation()}
      onMouseEnter={() => {
        if (audioRef.current) audioRef.current.volume = audioVolume;
      }}
    >
      <audio ref={audioRef} src={audioMedia.url} preload="none" onError={(e) => console.error('Audio load error:', e)} />

      <div className="flex items-start gap-3">
        <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center flex-shrink-0 shadow-lg group-hover:shadow-xl group-hover:scale-105 transition-all duration-300">
          <Music size={24} className="text-white" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between">
            <div className="flex flex-col">
              <p className="text-sm font-semibold text-white truncate flex items-center">
                {title}
                {isMp3 && (<span className="ml-2 text-xs text-white/60 bg-white/10 rounded px-1 py-0.5">MP3</span>)}
              </p>
              {audioMedia.size ? (<p className="text-xs text-white/50 mt-0.5">{(audioMedia.size / 1024).toFixed(1)} KB</p>) : null}
            </div>
            <a
              href={audioMedia.url}
              download={fileName}
              onClick={(e) => e.stopPropagation()}
              className="p-2 rounded-xl bg-white/10 hover:bg-white/20 opacity-0 group-hover:opacity-100 translate-y-1 group-hover:translate-y-0 transition-all duration-300 flex items-center justify-center"
              title="Скачать"
            >
              <Download size={16} className="text-white" />
            </a>
          </div>
          <p className="text-xs text-white/50 truncate mt-0.5">{artist}</p>
        </div>
      </div>

      {/* Player */}
      <div className="mt-4 flex items-center gap-3">
        <button
          onClick={toggleAudio}
          className="w-10 h-10 rounded-full bg-white/20 hover:bg-white/30 flex items-center justify-center flex-shrink-0 transition-all active:scale-95 shadow-lg hover:shadow-xl"
        >
          {isPlaying ? (
            <Pause size={16} className="text-white" fill="currentColor" />
          ) : (
            <Play size={16} className="text-white ml-0.5" fill="currentColor" />
          )}
        </button>

        <div className="flex-1 min-w-0">
          <div
            className="relative h-2 bg-white/15 rounded-full cursor-pointer group/progress overflow-visible"
            onClick={handleSeek}
            onMouseMove={handleProgressHover}
            onMouseLeave={() => setHoverTime(null)}
          >
            {hoverTime !== null && (
              <div className="absolute -top-8 px-2 py-1 bg-black/80 rounded-lg text-xs text-white pointer-events-none transform -translate-x-1/2 whitespace-nowrap" style={{ left: `${(hoverTime / (audioDuration || 1)) * 100}%` }}>
                {formatDuration(hoverTime)}
              </div>
            )}
            <div className="absolute left-0 top-0 h-full bg-gradient-to-r from-purple-400 to-pink-400 rounded-full transition-all group-hover/progress:bg-gradient-to-r group-hover/progress:from-purple-300 group-hover/progress:to-pink-300" style={{ width: `${audioProgress}%` }} />
            <div className="absolute top-1/2 w-4 h-4 bg-white rounded-full shadow-lg transition-opacity" style={{ left: `clamp(0px, calc(${audioProgress}% - 8px), calc(100% - 16px))`, top: '50%', transform: 'translateY(-50%)', opacity: '1' }} />
          </div>
          <div className="flex justify-between mt-1.5">
            <span className="text-[11px] text-white/60 font-medium tabular-nums">{isPlaying ? formatDuration(audioRef.current?.currentTime || 0) : '0:00'}</span>
            <span className="text-[11px] text-white/60 font-medium tabular-nums">{formatDuration(audioDuration || 0)}</span>
          </div>
        </div>

        <div className="relative flex-shrink-0">
          <button onClick={() => setShowVolumeSlider(!showVolumeSlider)} className="p-2 rounded-lg hover:bg-white/10 transition-colors" title="Громкость">
            <Volume2 size={16} className="text-white/70" />
          </button>
          {showVolumeSlider && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setShowVolumeSlider(false)} />
              <div className="absolute bottom-full right-0 mb-2 p-3 bg-black/90 backdrop-blur-xl rounded-xl border border-white/10 shadow-xl z-50" style={{ marginBottom: '8px', marginRight: 'max(8px, env(safe-area-inset-right))', maxWidth: 'min(90vw, 220px)', right: '0' }}>
                <div className="flex flex-col items-center gap-2">
                  <span className="text-[10px] text-white/50">{Math.round(audioVolume * 100)}%</span>
                  <div className="flex items-center gap-2 w-full">
                    <button onClick={() => handleVolumeChange(audioVolume > 0 ? 0 : 0.7)} className="p-1 hover:bg-white/10 rounded transition-colors shrink-0">
                      <Volume2 size={14} className={audioVolume === 0 ? 'text-white/50' : 'text-white/70'} />
                    </button>
                    <div className="flex-1 h-2 bg-white/20 rounded-full relative cursor-pointer group/vol overflow-hidden">
                      <input type="range" min="0" max="1" step="0.01" value={audioVolume} onChange={(e) => handleVolumeChange(parseFloat(e.target.value))} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10" />
                      <div className="absolute top-0 left-0 h-full bg-gradient-to-r from-purple-400 to-pink-400 rounded-full transition-all" style={{ width: `${audioVolume * 100}%` }} />
                    </div>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default memo(MessageAudio);
