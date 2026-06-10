import { useState, useRef, useEffect, memo } from 'react';
import { Play, Pause } from 'lucide-react';
import { extractWaveform } from '../../lib/utils';
import { useVisibilityObserver } from '../../lib/hooks';
import type { MediaItem } from '../../lib/types';

interface MessageVoiceProps {
  media: MediaItem[];
  isMine: boolean;
}

function MessageVoice({ media, isMine }: MessageVoiceProps) {
  const voiceMedia = media.find((m) => m.type === 'voice');
  if (!voiceMedia) return null;

  const [isPlaying, setIsPlaying] = useState(false);
  const [audioProgress, setAudioProgress] = useState(0);
  const [audioDuration, setAudioDuration] = useState(0);
  const [waveformBars, setWaveformBars] = useState<number[] | null>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const isVisible = useVisibilityObserver(containerRef, '300px');

  useEffect(() => {
    if (voiceMedia.url) {
      extractWaveform(voiceMedia.url, 28).then(setWaveformBars);
    }
  }, [voiceMedia.url]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const onTimeUpdate = () => {
      if (audio.duration) {
        setAudioProgress((audio.currentTime / audio.duration) * 100);
      }
    };
    const onLoadedMetadata = () => {
      setAudioDuration(audio.duration);
    };
    const onEnded = () => {
      setIsPlaying(false);
      setAudioProgress(0);
    };

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

  const formatDuration = (sec: number) => {
    if (!sec || isNaN(sec) || !isFinite(sec)) return '0:00';
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  return (
    <div ref={containerRef} onClick={e => e.stopPropagation()} onTouchStart={e => e.stopPropagation()} className="flex items-center gap-3 w-full max-w-[260px] md:max-w-[280px] py-1 overflow-hidden">
      <audio
        ref={audioRef}
        src={voiceMedia.url}
        preload="none"
        onError={(e) => {
          const target = e.target as HTMLAudioElement;
          console.error('Audio load error:', target.error?.message || 'Unknown error');
        }}
      />
      <button
        onClick={toggleAudio}
        className={`w-11 h-11 md:w-12 md:h-12 rounded-full flex items-center justify-center flex-shrink-0 transition-all duration-200 shadow-lg ${
          isMine
            ? 'bg-white/25 hover:bg-white/35 active:scale-95 shadow-white/10'
            : 'bg-gradient-to-br from-vortex-500 to-vortex-600 hover:from-vortex-600 hover:to-vortex-700 active:scale-95 shadow-vortex-500/30'
        }`}
      >
        {isPlaying ? (
          <Pause size={18} className="text-white drop-shadow-sm" fill="currentColor" />
        ) : (
          <Play size={18} className="text-white ml-0.5 drop-shadow-sm" fill="currentColor" />
        )}
      </button>
      <div className="flex-1 min-w-0">
        <div
          className="flex items-end gap-[3px] md:gap-1 h-8 md:h-9 cursor-pointer group flex-1 min-w-0 overflow-hidden"
          onClick={(e) => {
            const audio = audioRef.current;
            if (!audio || !audio.duration) return;
            const rect = e.currentTarget.getBoundingClientRect();
            const pct = (e.clientX - rect.left) / rect.width;
            audio.currentTime = pct * audio.duration;
            setAudioProgress(pct * 100);
            if (!isPlaying) toggleAudio();
          }}
        >
          {(waveformBars || Array(28).fill(0.5)).map((val, i) => {
            const barHeight = Math.max(15, val * 100);
            const progress = audioProgress / 100;
            const barProgress = i / 28;
            const isActive = barProgress < progress;
            return (
              <div
                key={i}
                className={`flex-1 rounded-full transition-all duration-150 ${
                  isActive
                    ? isMine ? 'bg-white shadow-sm' : 'bg-vortex-300 shadow-sm'
                    : isMine ? 'bg-white/30 group-hover:bg-white/40' : 'bg-white/20 group-hover:bg-white/30'
                }`}
                style={{ height: `${barHeight}%`, minWidth: '2px' }}
              />
            );
          })}
        </div>
        <div className="flex items-center justify-between mt-1.5">
          <span className={`text-xs font-medium ${isMine ? 'text-white/80' : 'text-zinc-400'}`}>
            {isPlaying
              ? formatDuration(audioRef.current?.currentTime || 0)
              : formatDuration(audioDuration || voiceMedia.duration || 0)}
          </span>
          <span className={`text-[10px] font-medium ${isMine ? 'text-white/60' : 'text-zinc-500'}`}>
            {isPlaying ? 'Воспроизведение...' : 'Голосовое'}
          </span>
        </div>
      </div>
    </div>
  );
}

export default memo(MessageVoice);
