import { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import {
  ArrowLeft,
  Check,
  Mic,
  Headphones,
  Keyboard,
} from 'lucide-react';
import type { SideMenuContext } from './types';

interface AudioViewProps {
  ctx: SideMenuContext;
}

export default function AudioView({ ctx }: AudioViewProps) {
  const { t, changeView } = ctx;

  const [activeMicId, setActiveMicId] = useState<string>('');
  const [activeSpeakerId, setActiveSpeakerId] = useState<string>('');
  const [pushToTalk, setPushToTalk] = useState(false);
  const [pushToTalkKey, setPushToTalkKey] = useState('Ctrl');
  const [microphones, setMicrophones] = useState<MediaDeviceInfo[]>([]);
  const [speakers, setSpeakers] = useState<MediaDeviceInfo[]>([]);
  const [micLevel, setMicLevel] = useState(0);
  const [testingMic, setTestingMic] = useState(false);
  const [recordingKey, setRecordingKey] = useState(false);
  const micStreamRef = useRef<MediaStream | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const animFrameRef = useRef<number>(0);

  useEffect(() => {
    enumerateDevices();
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
      if (audioContextRef.current) {
        audioContextRef.current.close().catch(() => {});
      }
      if (micStreamRef.current) {
        micStreamRef.current.getTracks().forEach(t => t.stop());
      }
    };
  }, []);

  // Global key capture for PTT
  useEffect(() => {
    if (!recordingKey) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const key = e.key === ' ' ? 'Space' : e.key;
      if (key.length === 1 || ['Space', 'Enter', 'Tab', 'Shift', 'Control', 'Alt', 'Meta', 'CapsLock', 'Escape', 'Backspace', 'Delete', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(key)) {
        handlePushToTalkKeyChange(key);
      }
      setRecordingKey(false);
    };
    window.addEventListener('keydown', handleKeyDown, { capture: true, once: true });
    return () => window.removeEventListener('keydown', handleKeyDown, { capture: true });
  }, [recordingKey]);

  const enumerateDevices = async () => {
    try {
      await navigator.mediaDevices.getUserMedia({ audio: true });
      const devices = await navigator.mediaDevices.enumerateDevices();
      const mics = devices.filter(d => d.kind === 'audioinput');
      const spks = devices.filter(d => d.kind === 'audiooutput');
      setMicrophones(mics);
      setSpeakers(spks);

      const savedMic = localStorage.getItem('audio_mic');
      const savedSpeaker = localStorage.getItem('audio_speaker');
      const savedPTT = localStorage.getItem('audio_ptt');
      const savedPTTKey = localStorage.getItem('audio_ptt_key');

      if (savedMic) setActiveMicId(savedMic);
      if (savedSpeaker) setActiveSpeakerId(savedSpeaker);
      if (savedPTT) setPushToTalk(savedPTT === 'true');
      if (savedPTTKey) setPushToTalkKey(savedPTTKey);
    } catch (e) {
      console.warn('Could not enumerate audio devices:', e);
    }
  };

  const handleMicChange = (deviceId: string) => {
    setActiveMicId(deviceId);
    localStorage.setItem('audio_mic', deviceId);
  };

  const handleSpeakerChange = (deviceId: string) => {
    setActiveSpeakerId(deviceId);
    localStorage.setItem('audio_speaker', deviceId);
  };

  const handlePushToTalkChange = (enabled: boolean) => {
    setPushToTalk(enabled);
    localStorage.setItem('audio_ptt', String(enabled));
  };

  const handlePushToTalkKeyChange = (key: string) => {
    setPushToTalkKey(key);
    localStorage.setItem('audio_ptt_key', key);
  };

  const startMicTest = async () => {
    try {
      const constraints: MediaStreamConstraints = activeMicId
        ? { audio: { deviceId: { exact: activeMicId } } }
        : { audio: true };
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      micStreamRef.current = stream;
      const ctx = new AudioContext();
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;

      const gainNode = ctx.createGain();
      gainNode.gain.value = 0.8;
      source.connect(analyser);
      source.connect(gainNode);
      gainNode.connect(ctx.destination);

      audioContextRef.current = ctx;
      analyserRef.current = analyser;
      setTestingMic(true);

      const data = new Uint8Array(analyser.frequencyBinCount);
      const update = () => {
        if (!analyserRef.current) return;
        analyserRef.current.getByteFrequencyData(data);
        const avg = data.reduce((a, b) => a + b, 0) / data.length;
        setMicLevel(avg);
        animFrameRef.current = requestAnimationFrame(update);
      };
      animFrameRef.current = requestAnimationFrame(update);
    } catch (e) {
      console.warn('Mic test failed:', e);
    }
  };

  const stopMicTest = () => {
    if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    if (audioContextRef.current) {
      audioContextRef.current.close().catch(() => {});
      audioContextRef.current = null;
    }
    if (micStreamRef.current) {
      micStreamRef.current.getTracks().forEach(t => t.stop());
      micStreamRef.current = null;
    }
    analyserRef.current = null;
    setTestingMic(false);
    setMicLevel(0);
  };

  return (
    <motion.div key="audio" className="flex flex-col h-full" initial={{ x: 100, opacity: 0 }} animate={{ x: 0, opacity: 1 }} exit={{ x: 100, opacity: 0 }} transition={{ duration: 0.2 }}>
      <div className="h-14 flex items-center gap-3 px-4 border-b border-border flex-shrink-0">
        <button onClick={() => changeView('main')} className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-white/10 transition-colors">
          <ArrowLeft size={20} />
        </button>
        <h3 className="text-sm font-semibold text-white flex-1">{t('voiceAndVideo')}</h3>
      </div>
      <div className="flex-1 overflow-y-auto py-3 space-y-4">
        {/* Microphone */}
        <div className="px-5">
          <h4 className="text-xs text-zinc-500 uppercase tracking-wide mb-3 flex items-center gap-2">
            <Mic size={14} className="text-vortex-400" />
            {t('microphone')}
          </h4>
          <div className="space-y-1">
            {microphones.length === 0 ? (
              <p className="text-xs text-zinc-500 text-center py-3">{t('noMicrophones')}</p>
            ) : (
              microphones.map((mic, i) => (
                <button
                  key={mic.deviceId}
                  onClick={() => handleMicChange(mic.deviceId)}
                  className={`w-full flex items-center gap-3 px-3 py-3 rounded-xl transition-colors ${activeMicId === mic.deviceId ? 'bg-vortex-500/15 ring-1 ring-vortex-500/30' : 'bg-surface-tertiary/50 hover:bg-surface-hover'}`}
                >
                  <div className="w-8 h-8 rounded-full bg-white/5 flex items-center justify-center">
                    <Mic size={14} className={activeMicId === mic.deviceId ? 'text-vortex-400' : 'text-zinc-500'} />
                  </div>
                  <div className="flex-1 min-w-0 text-left">
                    <p className="text-sm text-zinc-200 truncate">{mic.label || `${t('microphone')} ${i + 1}`}</p>
                  </div>
                  {activeMicId === mic.deviceId && <Check size={16} className="text-vortex-400 flex-shrink-0" />}
                </button>
              ))
            )}
          </div>
          {/* Mic test */}
          <div className="mt-3 bg-surface-tertiary/50 rounded-xl p-3">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-zinc-400">{t('micTest')}</span>
              <button
                onClick={testingMic ? stopMicTest : startMicTest}
                className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors ${testingMic ? 'bg-red-500/20 text-red-400' : 'bg-vortex-500/20 text-vortex-400'}`}
              >
                {testingMic ? t('stop') : t('test')}
              </button>
            </div>
            <div className="h-2 bg-white/5 rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-emerald-500 to-vortex-500 transition-all duration-75"
                style={{ width: `${Math.min(100, micLevel / 2.55)}%` }}
              />
            </div>
          </div>
        </div>

        {/* Output device */}
        <div className="px-5">
          <h4 className="text-xs text-zinc-500 uppercase tracking-wide mb-3 flex items-center gap-2">
            <Headphones size={14} className="text-vortex-400" />
            {t('outputDevice')}
          </h4>
          <div className="space-y-1">
            {speakers.length === 0 ? (
              <p className="text-xs text-zinc-500 text-center py-3">{t('noOutputDevices')}</p>
            ) : (
              speakers.map((spk, i) => (
                <button
                  key={spk.deviceId}
                  onClick={() => handleSpeakerChange(spk.deviceId)}
                  className={`w-full flex items-center gap-3 px-3 py-3 rounded-xl transition-colors ${activeSpeakerId === spk.deviceId ? 'bg-vortex-500/15 ring-1 ring-vortex-500/30' : 'bg-surface-tertiary/50 hover:bg-surface-hover'}`}
                >
                  <div className="w-8 h-8 rounded-full bg-white/5 flex items-center justify-center">
                    <Headphones size={14} className={activeSpeakerId === spk.deviceId ? 'text-vortex-400' : 'text-zinc-500'} />
                  </div>
                  <div className="flex-1 min-w-0 text-left">
                    <p className="text-sm text-zinc-200 truncate">{spk.label || `${t('outputDevice')} ${i + 1}`}</p>
                  </div>
                  {activeSpeakerId === spk.deviceId && <Check size={16} className="text-vortex-400 flex-shrink-0" />}
                </button>
              ))
            )}
          </div>
        </div>

        {/* Push to Talk */}
        <div className="px-5">
          <h4 className="text-xs text-zinc-500 uppercase tracking-wide mb-3 flex items-center gap-2">
            <Keyboard size={14} className="text-vortex-400" />
            {t('pushToTalk')}
          </h4>
          <div className="bg-surface-tertiary/50 rounded-xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="min-w-0">
                <p className="text-sm text-zinc-200">{t('enablePushToTalk')}</p>
                <p className="text-[11px] text-zinc-500 mt-0.5">{t('pushToTalkDesc')}</p>
              </div>
              <button
                onClick={() => handlePushToTalkChange(!pushToTalk)}
                className={`w-10 h-6 rounded-full transition-colors flex items-center px-0.5 ${pushToTalk ? 'bg-vortex-500' : 'bg-zinc-600'}`}
              >
                <div className={`w-5 h-5 rounded-full bg-white shadow transition-transform ${pushToTalk ? 'translate-x-4' : 'translate-x-0'}`} />
              </button>
            </div>
            {pushToTalk && (
              <div className="pt-2 border-t border-white/5">
                <p className="text-xs text-zinc-400 mb-2">{t('pttKey')}</p>
                <button
                  onClick={() => setRecordingKey(true)}
                  className={`w-full py-2 rounded-lg text-sm font-medium transition-colors ${recordingKey ? 'bg-vortex-500/30 text-vortex-400 ring-1 ring-vortex-500/50' : 'bg-white/5 text-zinc-400 hover:bg-white/10'}`}
                >
                  {recordingKey ? t('pressKey') : `${t('currentKey')}: ${pushToTalkKey}`}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </motion.div>
  );
}
