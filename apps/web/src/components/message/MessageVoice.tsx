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
      extractWaveform(voiceMedia.url, 32).then(setWaveformBars);
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

  const progress = audioProgress / 100;
  const currentTime = audioRef.current?.currentTime || 0;
  const totalDuration = audioDuration || voiceMedia.duration || 0;

  return (
    <div ref={containerRef} onClick={e => e.stopPropagation()} onTouchStart={e => e.stopPropagation()} className="w-full max-w-[300px] md:max-w-[320px]">
      <audio
        ref={audioRef}
        src={voiceMedia.url}
        preload="none"
        onError={(e) => {
          const target = e.target as HTMLAudioElement;
          console.error('Audio load error:', target.error?.message || 'Unknown error');
        }}
      />

      {/* Main container — pill shape */}
      <div className={`flex items-center gap-2.5 px-3 py-2.5 rounded-2xl backdrop-blur-sm ${
        isMine
          ? 'bg-white/10'
          : 'bg-black/10'
      }`}>
        {/* Play/Pause button */}
        <button
          onClick={toggleAudio}
          className={`relative w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 transition-all duration-200 ${
            isMine
              ? 'bg-white/20 hover:bg-white/30 active:scale-90'
              : 'bg-vortex-500 hover:bg-vortex-600 active:scale-90 shadow-lg shadow-vortex-500/25'
          }`}
        >
          {/* Ripple animation when playing */}
          {isPlaying && (
            <span className={`absolute inset-0 rounded-full animate-ping ${
              isMine ? 'bg-white/10' : 'bg-vortex-400/30'
            }`} style={{ animationDuration: '1.5s' }} />
          )}
          {isPlaying ? (
            <Pause size={16} className="text-white relative z-10" fill="currentColor" />
          ) : (
            <Play size={16} className="text-white ml-0.5 relative z-10" fill="currentColor" />
          )}
        </button>

        {/* Waveform + time */}
        <div className="flex-1 min-w-0">
          {/* Waveform */}
          <div
            className="flex items-center gap-[2px] h-7 cursor-pointer"
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
            {(waveformBars || Array(32).fill(0.5)).map((val, i) => {
              const barHeight = Math.max(4, val * 28);
              const barProgress = i / 32;
              const isActive = barProgress < progress;
              return (
                <div
                  key={i}
                  className="flex-1 rounded-full transition-all duration-100"
                  style={{
                    height: `${barHeight}px`,
                    minWidth: '1.5px',
                    backgroundColor: isActive
                      ? isMine ? 'rgba(255,255,255,0.9)' : 'rgb(139, 92, 246)'
                      : isMine ? 'rgba(255,255,255,0.25)' : 'rgba(255,255,255,0.15)',
                  }}
                />
              );
            })}
          </div>

          {/* Time info */}
          <div className="flex items-center justify-between mt-1">
            <span className={`text-[11px] tabular-nums font-medium ${isMine ? 'text-white/70' : 'text-zinc-400'}`}>
              {isPlaying ? formatDuration(currentTime) : formatDuration(totalDuration)}
            </span>
            {isPlaying && (
              <span className={`text-[10px] font-medium ${isMine ? 'text-white/50' : 'text-zinc-500'}`}>
                {formatDuration(totalDuration - currentTime)}
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default memo(MessageVoice);
