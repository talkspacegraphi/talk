import { useState, useEffect, useRef, useCallback } from 'react';
// framer-motion removed: caused React error #321 with React 19.
// Using plain <div> with CSS animations (see .call-modal-* classes in index.css).
import { Phone, PhoneOff, Video, VideoOff, Mic, MicOff, Monitor, MonitorOff, Maximize, Minimize, SwitchCamera, Minimize2, Maximize2, Volume2, ShieldCheck, ShieldOff, ChevronUp, X, Minus } from 'lucide-react';
import { getSocket } from '../lib/socket';
import { api } from '../lib/api';
import { useLang } from '../lib/i18n';
import { playCallRingtone, stopCallRingtone, playUnavailableSound } from '../lib/sounds';
import ScreenSourcePicker from './ScreenSourcePicker';
import { isAndroidWebView, nativeCallLog } from '../lib/utils';

// Android WebView bridge — implemented in native Android code
declare global {
  interface Window {
    Android?: {
      releaseMicrophone?: () => void; // kills processes holding mic, optional
    };
  }
}
type CallState = 'idle' | 'calling' | 'incoming' | 'connected' | 'ended';

interface CallModalProps {
  isOpen: boolean;
  onClose: () => void;
  targetUser: { id: string; displayName?: string; username: string; avatar?: string | null } | null;
  callType: 'voice' | 'video';
  incoming?: {
    from: string;
    offer: RTCSessionDescriptionInit;
    callType: 'voice' | 'video';
    callerInfo?: { displayName?: string; username?: string; avatar?: string | null } | null;
  } | null;
}

// ICE servers cache (fetched from server, includes TURN credentials when configured)
let cachedIceConfig: RTCConfiguration | null = null;
let iceCacheFetchedAt = 0;
const ICE_CACHE_TTL = 3600_000; // 1 hour

const FALLBACK_ICE: RTCConfiguration = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
    { urls: 'stun:stun3.l.google.com:19302' },
    { urls: 'stun:stun4.l.google.com:19302' },
    {
      urls: [
        'turn:openrelay.metered.ca:80?transport=udp',
        'turn:openrelay.metered.ca:443?transport=tcp',
      ],
      username: 'openrelayproject',
      credential: 'openrelayproject',
    },
  ],
};

async function getIceServers(): Promise<RTCConfiguration> {
  if (cachedIceConfig && Date.now() - iceCacheFetchedAt < ICE_CACHE_TTL) {
    return cachedIceConfig;
  }
  try {
    const data = await api.getIceServers();
    if (data.iceServers && data.iceServers.length > 0) {
      cachedIceConfig = { iceServers: data.iceServers };
      iceCacheFetchedAt = Date.now();
      return cachedIceConfig;
    }
  } catch (e) {
    console.warn('Failed to fetch ICE servers, using fallback STUN:', e);
  }
  return FALLBACK_ICE;
}

// Try to get video+audio, falling back to audio-only
// If preferDeviceId is given, try that camera first
// Release microphone by sending a native signal (Android WebView) or
// by stopping any MediaStream tracks we can enumerate
async function releaseMicrophoneForAndroid(): Promise<void> {
  nativeCallLog('releaseMicrophone: attempting to free mic...');
  // 1) Signal Android native layer to kill processes holding the mic
  if (isAndroidWebView() && (window as any).Android?.releaseMicrophone) {
    try {
      (window as any).Android.releaseMicrophone();
      nativeCallLog('releaseMicrophone: native releaseMicrophone() called');
      await new Promise(r => setTimeout(r, 800));
    } catch (e) {
      nativeCallLog(`releaseMicrophone: native call failed: ${e}`);
    }
  }
  // 2) Try to grab-and-release to flush the device (sometimes unblocks it)
  try {
    const probe = await navigator.mediaDevices.getUserMedia({ audio: true });
    probe.getTracks().forEach(t => t.stop());
    nativeCallLog('releaseMicrophone: probe grab-release OK');
    await new Promise(r => setTimeout(r, 400));
  } catch {
    nativeCallLog('releaseMicrophone: probe failed (device still busy)');
    await new Promise(r => setTimeout(r, 1500));
  }
}
async function getMediaWithCameraFallback(
  wantVideo: boolean,
  preferDeviceId?: string
): Promise<{ stream: MediaStream; hasVideo: boolean }> {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error('navigator.mediaDevices is not available. Calls require HTTPS or localhost.');
  }

  // Kill ALL active media tracks to free the microphone
  const killAllTracks = async () => {
    // Stop local call streams
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(t => { t.stop(); t.enabled = false; });
      nativeCallLog(`Killed localStream: ${localStreamRef.current.getTracks().length} tracks`);
    }
    // Stop noise gate tracks
    if (noiseGateTrackRef.current) {
      noiseGateTrackRef.current.stop();
      nativeCallLog('Killed noiseGate track');
    }
    if (noiseGateCtxRef.current) {
      noiseGateCtxRef.current.close().catch(() => {});
    }
    // Force release by re-acquiring and immediately stopping
    try {
      const tempStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      tempStream.getTracks().forEach(t => t.stop());
      nativeCallLog(`Force-released ${tempStream.getTracks().length} temp tracks`);
    } catch {}
  };

  // Helper: try getUserMedia with retries on Android
const tryWithRetries = async (constraints: MediaStreamConstraints, maxRetries = 20): Promise<MediaStream> => {
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia(constraints);
        nativeCallLog(`getUserMedia OK on attempt ${attempt + 1}`);
        return stream;
      } catch (e: any) {
        const isLast = attempt === maxRetries - 1;
        const isPermError = e?.name === 'NotAllowedError' || e?.name === 'NotFoundError';
        const isNotReadable = e?.name === 'NotReadableError';
        const isAbort = e?.name === 'AbortError';
        nativeCallLog(`getUserMedia attempt ${attempt + 1} FAILED: ${e?.name} - ${e?.message}`);

        if (isAndroidWebView() && (isPermError || isNotReadable || isAbort) && !isLast) {
          // On first NotReadableError/AbortError — aggressively release the mic
          if ((isNotReadable || isAbort) && attempt === 0) {
            nativeCallLog('getUserMedia: mic busy on first attempt, running releaseMicrophoneForAndroid...');
            await releaseMicrophoneForAndroid();
            continue;
          }
          // On subsequent NotReadableError — escalating wait + release
          if (isNotReadable || isAbort) {
            const delay = Math.min(1000 * (attempt + 1), 4000);
            nativeCallLog(`getUserMedia: mic busy (attempt ${attempt + 1}), waiting ${delay}ms...`);
            await new Promise(r => setTimeout(r, delay));
            // Every 3 attempts, try release again
            if (attempt % 3 === 0) {
              await releaseMicrophoneForAndroid();
            }
            continue;
          }
          // Permission error — wait for dialog
          const delay = 1000;
          nativeCallLog(`getUserMedia: permission error (attempt ${attempt + 1}), waiting ${delay}ms...`);
          await new Promise(r => setTimeout(r, delay));
          continue;
        }
        throw e;
      }
    }
    throw new Error('Failed to get media after retries');
  };

  if (!wantVideo) {
    const stream = await tryWithRetries({
      audio: isAndroidWebView()
        ? { echoCancellation: true, noiseSuppression: true, autoGainControl: true }
        : true,
    });
    return { stream, hasVideo: false };
  }

  // 1) If we have a preferred camera, try it first
  if (preferDeviceId) {
    try {
      console.log('[getMedia] Trying preferred camera:', preferDeviceId.slice(0, 12));
      const stream = await tryWithRetries({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
        video: { deviceId: { exact: preferDeviceId } },
      });
      console.log('[getMedia] Preferred camera success');
      return { stream, hasVideo: true };
    } catch (e) {
      console.warn('[getMedia] Preferred camera failed:', e);
    }
  }

  // 2) Try default audio+video
  try {
    console.log('[getMedia] Requesting audio+video (default camera)...');
    const stream = await tryWithRetries({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }, video: true });
    console.log('[getMedia] Success —', stream.getVideoTracks().map(t => `${t.label}:${t.readyState}`));
    return { stream, hasVideo: true };
  } catch (e) {
    console.warn('[getMedia] audio+video failed:', e);
  }

  // 3) Final fallback: audio only
  console.warn('[getMedia] Camera unavailable, falling back to audio only');
  const stream = await tryWithRetries({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
  return { stream, hasVideo: false };
}

// Find a video sender on the peer connection, even if sender.track is null (recvonly transceiver)
function findVideoSender(pc: RTCPeerConnection): RTCRtpSender | undefined {
  // First try sender with an active video track
  const withTrack = pc.getSenders().find(s => s.track?.kind === 'video');
  if (withTrack) return withTrack;
  // Fall back to sender from a video transceiver (may have null track)
  const videoTransceiver = pc.getTransceivers().find(
    t => t.receiver?.track?.kind === 'video'
  );
  return videoTransceiver?.sender;
}

export default function CallModal({ isOpen, onClose, targetUser, callType: initialCallType, incoming }: CallModalProps) {
  const { t } = useLang();
  const [callState, setCallState] = useState<CallState>('idle');
  const [callType, setCallType] = useState<'voice' | 'video'>(initialCallType);
  const [isMuted, setIsMuted] = useState(false);
  const [isVideoOff, setIsVideoOff] = useState(false);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [hasRemoteVideo, setHasRemoteVideo] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const [duration, setDuration] = useState(0);
  const [cameras, setCameras] = useState<MediaDeviceInfo[]>([]);
  const [showCameraMenu, setShowCameraMenu] = useState(false);
  const [activeCameraId, setActiveCameraId] = useState<string>('');
  const [remoteVolume, setRemoteVolume] = useState(1);
  const [showVolumeSlider, setShowVolumeSlider] = useState(false);
  const [noiseSuppression, setNoiseSuppression] = useState(false);
  const [microphones, setMicrophones] = useState<MediaDeviceInfo[]>([]);
  const [activeMicId, setActiveMicId] = useState<string>('');
  const [showMicMenu, setShowMicMenu] = useState(false);
  const [speakers, setSpeakers] = useState<MediaDeviceInfo[]>([]);
  const [activeSpeakerId, setActiveSpeakerId] = useState<string>('');
  const [showSpeakerMenu, setShowSpeakerMenu] = useState(false);
  const [showScreenSourcePicker, setShowScreenSourcePicker] = useState(false);

  // Mobile-specific state
  const [isMobile, setIsMobile] = useState(() => typeof window !== 'undefined' && window.innerWidth <= 768);
  const [isEarpieceMode, setIsEarpieceMode] = useState(true);
  const [showNoAnswerScreen, setShowNoAnswerScreen] = useState(false);

  const peerRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const screenStreamRef = useRef<MediaStream | null>(null);
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const remoteAudioRef = useRef<HTMLAudioElement>(null);
  const timerRef = useRef<ReturnType<typeof setInterval>>(undefined);
  const callTimeoutRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const closeTimeoutRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const targetUserIdRef = useRef<string>('');
  const iceCandidateBufferRef = useRef<RTCIceCandidateInit[]>([]);
  const callEndedRef = useRef(false);
  const videoContainerRef = useRef<HTMLDivElement>(null);
  const devicesArrayRef = useRef<MediaDeviceInfo[]>([]);

  const remoteStreamRef = useRef<MediaStream | null>(null);
  const disconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const callInProgressRef = useRef(false); // guard against multiple startCall/acceptCall
  const earpieceEnsuredRef = useRef(false); // guard: ensure earpiece is set only once per call

  // Refresh all devices on call connect
  const refreshAllDevices = useCallback(async () => {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      devicesArrayRef.current = devices;
      const audioInputs = devices.filter(d => d.kind === 'audioinput');
      const audioOutputs = devices.filter(d => d.kind === 'audiooutput');
      setMicrophones(audioInputs);
      setSpeakers(audioOutputs);
    } catch { /* ignore */ }
  }, []);
  // Track whether video was active before screen share to decide restoration behavior
  const hadVideoBeforeScreenShareRef = useRef(false);
  // Noise gate refs
  const noiseGateCtxRef = useRef<AudioContext | null>(null);
  const noiseGateGainRef = useRef<GainNode | null>(null);
  const noiseGateRafRef = useRef<number>(0);
  const noiseGateTrackRef = useRef<MediaStreamTrack | null>(null);

  // Push-to-Talk state
  const [pushToTalkEnabled, setPushToTalkEnabled] = useState(false);
  const [pushToTalkKey, setPushToTalkKey] = useState('Ctrl');
  const [pttActive, setPttActive] = useState(false);
  const pttPressedRef = useRef(false);

  // Load PTT settings
  useEffect(() => {
    const ptt = localStorage.getItem('audio_ptt') === 'true';
    const key = localStorage.getItem('audio_ptt_key') || 'Ctrl';
    setPushToTalkEnabled(ptt);
    setPushToTalkKey(key);
  }, []);

  // Mobile detection
  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth <= 768);
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  // Toggle earpiece/speaker on mobile
const toggleEarpiece = useCallback(async () => {
    const newMode = !isEarpieceMode;
    setIsEarpieceMode(newMode);
    if (isAndroidWebView()) {
      (window as any).Android?.setSpeakerOn?.(!newMode);
      return;
    }
    try {
      // Use setSinkId if available to switch audio output
      const audio = remoteAudioRef.current;
      if (audio && 'setSinkId' in audio) {
        const devices = await navigator.mediaDevices.enumerateDevices();
        const audioOutputs = devices.filter(d => d.kind === 'audiooutput');
        if (newMode) {
          // Earpiece — use default
          await (audio as any).setSinkId('');
        } else {
          // Speaker — find speaker device
          const speaker = audioOutputs.find(d => d.label.toLowerCase().includes('speaker') || d.label.toLowerCase().includes('динамик'));
          if (speaker) await (audio as any).setSinkId(speaker.deviceId);
        }
      }
    } catch (e) { console.warn('Speaker switch failed:', e); }
    // Also adjust volume for earpiece mode
    if (remoteAudioRef.current) {
      remoteAudioRef.current.volume = newMode ? 0.6 : 1;
    }
  }, [isEarpieceMode]);

  // Toggle camera on mobile (with permission request)
  const toggleMobileCamera = useCallback(async () => {
    if (callType === 'voice') {
      // Upgrade to video call
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
        const videoTrack = stream.getVideoTracks()[0];
        if (videoTrack && peerRef.current) {
          const sender = peerRef.current.getSenders().find(s => s.track?.kind === 'video');
          if (sender) {
            await sender.replaceTrack(videoTrack);
          } else {
            peerRef.current.addTrack(videoTrack, localStreamRef.current!);
          }
          stream.getVideoTracks().forEach(track => {
            localStreamRef.current?.addTrack(track);
          });
          setIsVideoOff(false);
          setCallType('video');
          const offer = await peerRef.current.createOffer();
          await peerRef.current.setLocalDescription(offer);
          getSocket()?.emit('renegotiate', { targetUserId: targetUserIdRef.current, offer: peerRef.current.localDescription });
        }
      } catch (e: any) {
        if (e?.name === 'NotAllowedError') {
          alert(isAndroidWebView()
            ? 'Разрешите доступ к камере в настройках Android'
            : 'Разрешите доступ к камере для видеозвонков');
        }
      }
    } else {
      // Video call — toggle video track on/off
      const videoTracks = localStreamRef.current?.getVideoTracks() || [];
      if (videoTracks.length > 0) {
        const newOff = videoTracks[0].enabled;
        videoTracks.forEach(t => { t.enabled = !newOff; });
        setIsVideoOff(newOff);
        // Replace track with null or re-add
        const sender = peerRef.current?.getSenders().find(s => s.track?.kind === 'video');
        if (sender && peerRef.current) {
          if (newOff) {
            // Turning off — replace with null
            await sender.replaceTrack(new MediaStreamTrack());
          } else {
            // Turning on — replace with existing track
            await sender.replaceTrack(videoTracks[0]);
          }
        }
      }
    }
  }, [callType, isVideoOff]);

  // PTT key handlers
  useEffect(() => {
    if (!pushToTalkEnabled || callState !== 'connected') return;
    const handleKeyDown = (e: KeyboardEvent) => {
      const key = e.key === ' ' ? 'Space' : e.key;
      if (key === pushToTalkKey && !pttPressedRef.current) {
        pttPressedRef.current = true;
        setPttActive(true);
        if (localStreamRef.current) {
          localStreamRef.current.getAudioTracks().forEach(t => { t.enabled = true; });
          setIsMuted(false);
        }
      }
    };
    const handleKeyUp = (e: KeyboardEvent) => {
      const key = e.key === ' ' ? 'Space' : e.key;
      if (key === pushToTalkKey && pttPressedRef.current) {
        pttPressedRef.current = false;
        setPttActive(false);
        if (localStreamRef.current) {
          localStreamRef.current.getAudioTracks().forEach(t => { t.enabled = false; });
          setIsMuted(true);
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [pushToTalkEnabled, pushToTalkKey, callState]);

  // Ensure mic starts muted when PTT is enabled and call connects
  useEffect(() => {
    if (pushToTalkEnabled && callState === 'connected' && localStreamRef.current) {
      localStreamRef.current.getAudioTracks().forEach(t => { t.enabled = false; });
      setIsMuted(true);
    }
  }, [pushToTalkEnabled, callState]);

  const cleanup = useCallback(() => {
    callInProgressRef.current = false;
    if (timerRef.current) clearInterval(timerRef.current);
    if (callTimeoutRef.current) clearTimeout(callTimeoutRef.current);
    if (closeTimeoutRef.current) clearTimeout(closeTimeoutRef.current);
    if (disconnectTimeoutRef.current) { clearTimeout(disconnectTimeoutRef.current); disconnectTimeoutRef.current = null; }
    stopCallRingtone();
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(track => track.stop());
      localStreamRef.current = null;
    }
    if (screenStreamRef.current) {
      screenStreamRef.current.getTracks().forEach(track => track.stop());
      screenStreamRef.current = null;
    }
    if (peerRef.current) {
      peerRef.current.onconnectionstatechange = null;
      peerRef.current.onicecandidate = null;
      peerRef.current.ontrack = null;
      peerRef.current.close();
      peerRef.current = null;
    }
    iceCandidateBufferRef.current = [];
    remoteStreamRef.current = null;
    // Clean up noise gate
    if (noiseGateRafRef.current) cancelAnimationFrame(noiseGateRafRef.current);
    if (noiseGateTrackRef.current) { noiseGateTrackRef.current.stop(); noiseGateTrackRef.current = null; }
    if (noiseGateCtxRef.current) { noiseGateCtxRef.current.close().catch(() => {}); noiseGateCtxRef.current = null; }
    noiseGateGainRef.current = null;
    pttPressedRef.current = false;
    setPttActive(false);
    setDuration(0);
    setIsMuted(false);
    setIsVideoOff(false);
    setIsScreenSharing(false);
    setHasRemoteVideo(false);
    setIsFullscreen(false);
    setIsMinimized(false);
    setShowCameraMenu(false);
    setShowVolumeSlider(false);
    setShowMicMenu(false);
    setShowSpeakerMenu(false);
    setNoiseSuppression(false);
  }, []);

  // Setup common peer connection event handlers
  const setupPeerHandlers = useCallback((pc: RTCPeerConnection) => {
    pc.onicecandidate = (e) => {
      if (e.candidate) {
        const socket = getSocket();
        socket?.emit('ice_candidate', {
          targetUserId: targetUserIdRef.current,
          candidate: e.candidate,
        });
      }
    };

    pc.ontrack = (e) => {
      console.log('[ontrack] Received track:', e.track.kind, 'readyState:', e.track.readyState,
        'enabled:', e.track.enabled, 'streams:', e.streams.length,
        'muted:', e.track.muted);
      nativeCallLog(`ontrack: kind=${e.track.kind} state=${e.track.readyState} enabled=${e.track.enabled} muted=${e.track.muted}`);
      // Always merge new tracks into the existing remote stream to avoid losing
      // audio when a video-only screen share track arrives on a separate stream.
      let stream: MediaStream;
      if (remoteStreamRef.current) {
        if (!remoteStreamRef.current.getTracks().includes(e.track)) {
          remoteStreamRef.current.addTrack(e.track);
        }
        stream = remoteStreamRef.current;
      } else if (e.streams[0]) {
        stream = e.streams[0];
      } else {
        stream = new MediaStream([e.track]);
      }

      remoteStreamRef.current = stream;

      // Check if remote has video tracks
      // Include !t.muted so we detect when the remote stops sending
      // (replaceTrack(null) or direction change causes muted=true)
      const checkVideo = () => {
        const videoTracks = stream.getVideoTracks();
        const hasVideo = videoTracks.length > 0 && videoTracks.some(
          t => t.readyState === 'live' && t.enabled && !t.muted
        );
        console.log('[checkVideo] videoTracks:', videoTracks.map(t =>
          `${t.label} state=${t.readyState} enabled=${t.enabled} muted=${t.muted}`
        ), '→ hasRemoteVideo:', hasVideo);
        setHasRemoteVideo(hasVideo);
      };

      // Listen for unmute/mute on every video track (muted→unmuted when data starts flowing)
      const attachTrackListeners = (track: MediaStreamTrack) => {
        if (track.kind !== 'video') return;
        track.onunmute = checkVideo;
        track.onmute = checkVideo;
        track.onended = checkVideo;
      };

      stream.getVideoTracks().forEach(attachTrackListeners);
      checkVideo();

      if (remoteVideoRef.current) {
        remoteVideoRef.current.srcObject = stream;
      }
      if (remoteAudioRef.current) {
        remoteAudioRef.current.srcObject = stream;
        const tryPlay = () => {
          remoteAudioRef.current?.play().catch(() => {
            if (isAndroidWebView()) setTimeout(tryPlay, 500);
          });
        };
        tryPlay();
      }

      // Track future additions/removals
      stream.onaddtrack = (ev) => {
        attachTrackListeners(ev.track);
        checkVideo();
      };
      stream.onremovetrack = checkVideo;

      // Also schedule a delayed check — some browsers delay unmute
      setTimeout(checkVideo, 500);
      setTimeout(checkVideo, 1500);
    };

    pc.onconnectionstatechange = () => {
      if (callEndedRef.current) return;
      const state = pc.connectionState;
      nativeCallLog(`PC state: ${state}`);
      if (state === 'failed') {
        // eslint-disable-next-line @typescript-eslint/no-use-before-define
        endCallSafe();
      } else if (state === 'disconnected') {
        // 'disconnected' is transient — give it time to recover before ending
        // Android WebView needs more time due to network layer instability
        const gracePeriod = isAndroidWebView() ? 12000 : 5000;
        if (!disconnectTimeoutRef.current) {
          disconnectTimeoutRef.current = setTimeout(() => {
            disconnectTimeoutRef.current = null;
            if (!callEndedRef.current && pc.connectionState === 'disconnected') {
              endCallSafe();
            }
          }, gracePeriod);
        }
      } else if (state === 'connected') {
        // Clear any pending disconnect timeout — connection recovered
        if (disconnectTimeoutRef.current) {
          clearTimeout(disconnectTimeoutRef.current);
          disconnectTimeoutRef.current = null;
        }
      }
    };
  }, []);

  // Schedule a tracked close timeout
  const scheduleClose = useCallback((delay = 1500) => {
    if (closeTimeoutRef.current) clearTimeout(closeTimeoutRef.current);
    closeTimeoutRef.current = setTimeout(() => {
      closeTimeoutRef.current = undefined;
      onClose();
    }, delay);
  }, [onClose]);

  // End call (safe to call multiple times)
const endCallSafe = useCallback(() => {
    if (callEndedRef.current) return;
    callEndedRef.current = true;
    callInProgressRef.current = false;
    if (isAndroidWebView()) (window as any).Android?.onCallEnded?.();
    const socket = getSocket();
    socket?.emit('call_end', { targetUserId: targetUserIdRef.current });
    stopCallRingtone();
    setCallState('ended');
    cleanup();
    scheduleClose();
  }, [cleanup, scheduleClose]);

  // Start outgoing call
  const startCall = useCallback(async () => {
    if (!targetUser) return;
    if (callInProgressRef.current) { nativeCallLog('startCall BLOCKED (already in progress)'); return; }
    callInProgressRef.current = true;
    targetUserIdRef.current = targetUser.id;
    callEndedRef.current = false;
    setCallState('calling');
    nativeCallLog(`startCall: target=${targetUser.id} type=${callType}`);

    try {
      console.log('[startCall] Getting media, wantVideo:', callType === 'video');
      nativeCallLog('startCall: requesting getUserMedia...');
      const { stream, hasVideo } = await getMediaWithCameraFallback(callType === 'video');
      nativeCallLog(`startCall: getUserMedia OK audio=${stream.getAudioTracks().length} video=${stream.getVideoTracks().length} hasVideo=${hasVideo}`);
      console.log('[startCall] Got media — hasVideo:', hasVideo,
        'audioTracks:', stream.getAudioTracks().length,
        'videoTracks:', stream.getVideoTracks().length);
      let effectiveCallType = callType;
      if (callType === 'video' && !hasVideo) {
        effectiveCallType = 'voice';
        setCallType('voice');
      }

      if (callEndedRef.current) {
        stream.getTracks().forEach(t => t.stop());
        callInProgressRef.current = false;
        return;
      }

      localStreamRef.current = stream;

      // Track active camera & mic
      const videoTrackSettings = stream.getVideoTracks()[0]?.getSettings();
      if (videoTrackSettings?.deviceId) setActiveCameraId(videoTrackSettings.deviceId);
      const audioTrackSettings = stream.getAudioTracks()[0]?.getSettings();
      if (audioTrackSettings?.deviceId) setActiveMicId(audioTrackSettings.deviceId);
      refreshAllDevices();

      const iceConfig = await getIceServers();
      nativeCallLog(`startCall: ICE servers count=${iceConfig.iceServers?.length}`);
      const pc = new RTCPeerConnection(iceConfig);
      peerRef.current = pc;

      // Add all tracks from the stream
      stream.getTracks().forEach(track => pc.addTrack(track, stream));

      // If this is a video call but we only have audio, add a recvonly video transceiver
      // so we can receive video from the other side and potentially add video later
      if (effectiveCallType === 'video' && stream.getVideoTracks().length === 0) {
        pc.addTransceiver('video', { direction: 'recvonly' });
      }

      setupPeerHandlers(pc);

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      const socket = getSocket();
      socket?.emit('call_offer', {
        targetUserId: targetUser.id,
        offer: pc.localDescription,
        callType: effectiveCallType,
      });

      // No-answer timeout: 30s on mobile, 15s on desktop
      const noAnswerDelay = isMobile ? 30000 : 15000;
      callTimeoutRef.current = setTimeout(async () => {
        if (callEndedRef.current) return;
        callEndedRef.current = true;
        stopCallRingtone();
        const s = getSocket();
        s?.emit('call_end', { targetUserId: targetUserIdRef.current });
        cleanup();
        if (isMobile) {
          setShowNoAnswerScreen(true);
          setCallState('ended');
        } else {
          setCallState('ended');
          await playUnavailableSound();
          onClose();
        }
      }, noAnswerDelay);
    } catch (err: any) {
      console.error('Error starting call:', err);
      nativeCallLog(`startCall ERROR: ${err?.name} - ${err?.message}`);
      callInProgressRef.current = false;
      if (err?.name === 'NotAllowedError' || err?.name === 'NotFoundError') {
        alert(isAndroidWebView()
          ? 'Разрешите доступ к микрофону для звонков. Нажмите "Звонить" снова.'
          : 'Разрешите доступ к микрофону в настройках браузера для совершения звонков');
        // Don't close — let user retry
        setCallState('idle');
        return;
      }
      setCallState('ended');
      cleanup();
    }
  }, [targetUser, callType, cleanup, onClose, setupPeerHandlers]);

  // Accept incoming call
  const acceptCall = useCallback(async () => {
    if (!incoming) return;
    if (callInProgressRef.current) { nativeCallLog('acceptCall BLOCKED (already in progress)'); return; }
    callInProgressRef.current = true;
    targetUserIdRef.current = incoming.from;
    callEndedRef.current = false;
    stopCallRingtone();
    nativeCallLog(`acceptCall: from=${incoming.from} type=${incoming.callType}`);

    try {
      console.log('[acceptCall] Getting media, wantVideo:', incoming.callType === 'video');
      nativeCallLog('acceptCall: requesting getUserMedia...');
      const { stream, hasVideo } = await getMediaWithCameraFallback(incoming.callType === 'video');
      nativeCallLog(`acceptCall: getUserMedia OK audio=${stream.getAudioTracks().length} video=${stream.getVideoTracks().length}`);
      console.log('[acceptCall] Got media — hasVideo:', hasVideo,
        'audioTracks:', stream.getAudioTracks().length,
        'videoTracks:', stream.getVideoTracks().length,
        'videoEnabled:', stream.getVideoTracks().map(t => t.enabled));
      let effectiveCallType = incoming.callType;
      if (incoming.callType === 'video' && !hasVideo) {
        effectiveCallType = 'voice';
      }

      if (callEndedRef.current) {
        stream.getTracks().forEach(t => t.stop());
        return;
      }

      localStreamRef.current = stream;

      // Track active camera & mic
      const videoTrackSettings = stream.getVideoTracks()[0]?.getSettings();
      if (videoTrackSettings?.deviceId) setActiveCameraId(videoTrackSettings.deviceId);
      const audioTrackSettings = stream.getAudioTracks()[0]?.getSettings();
      if (audioTrackSettings?.deviceId) setActiveMicId(audioTrackSettings.deviceId);
      refreshCameras();
      refreshMicrophones();

      const iceConfig = await getIceServers();
      nativeCallLog(`acceptCall: ICE servers count=${iceConfig.iceServers?.length}`);
      const pc = new RTCPeerConnection(iceConfig);
      peerRef.current = pc;

      // Setup handlers first so ontrack is ready when setRemoteDescription fires
      setupPeerHandlers(pc);

      // Standard answerer pattern: set remote description FIRST
      // This creates transceivers from the offer's m-lines
      nativeCallLog('acceptCall: setRemoteDescription...');
      await pc.setRemoteDescription(new RTCSessionDescription(incoming.offer));
      nativeCallLog('acceptCall: setRemoteDescription OK');

      // Now add local tracks — they reuse the transceivers created from the offer,
      // changing direction from recvonly to sendrecv
      stream.getTracks().forEach(track => {
        pc.addTrack(track, stream);
      });

      // If this is a video call but we only have audio, we need a recvonly video transceiver.
      // After setRemoteDescription, one already exists from the offer — but only if the offer
      // contained a video m-line. If it did, the transceiver is already recvonly.
      // If there's no video transceiver at all and we want to receive video, add one.
      if (incoming.callType === 'video' && !hasVideo) {
        const hasVideoTransceiver = pc.getTransceivers().some(
          t => t.receiver?.track?.kind === 'video'
        );
        if (!hasVideoTransceiver) {
          pc.addTransceiver('video', { direction: 'recvonly' });
        }
      }

      console.log('[acceptCall] Transceivers after setup:',
        pc.getTransceivers().map(t => ({
          mid: t.mid,
          direction: t.direction,
          senderTrack: t.sender?.track?.kind ?? null,
          receiverTrack: t.receiver?.track?.kind ?? null,
        })));
      nativeCallLog(`acceptCall: transceivers=${pc.getTransceivers().length} pcState=${pc.connectionState}`);

      if (callEndedRef.current) {
        nativeCallLog('acceptCall: ABORTED (callEndedRef=true)');
        pc.onconnectionstatechange = null;
        pc.close();
        peerRef.current = null;
        stream.getTracks().forEach(t => t.stop());
        localStreamRef.current = null;
        return;
      }

      // Flush buffered ICE candidates
      for (const candidate of iceCandidateBufferRef.current) {
        pc.addIceCandidate(new RTCIceCandidate(candidate)).catch(console.error);
      }
      iceCandidateBufferRef.current = [];

      nativeCallLog('acceptCall: createAnswer...');
      const answer = await pc.createAnswer();
      nativeCallLog('acceptCall: setLocalDescription...');
      await pc.setLocalDescription(answer);
      nativeCallLog('acceptCall: answer sent OK');

      console.log('[acceptCall] Answer created, transceivers:',
        pc.getTransceivers().map(t => ({
          mid: t.mid,
          direction: t.direction,
          currentDirection: t.currentDirection,
          senderTrack: t.sender?.track?.kind ?? null,
        })));

      if (callEndedRef.current) {
        pc.onconnectionstatechange = null;
        pc.close();
        peerRef.current = null;
        stream.getTracks().forEach(t => t.stop());
        localStreamRef.current = null;
        return;
      }

      const socket = getSocket();
      nativeCallLog(`acceptCall: emitting call_answer to ${incoming.from}`);
      socket?.emit('call_answer', {
        targetUserId: incoming.from,
        answer: pc.localDescription,
      });

      setCallType(effectiveCallType);
setCallState('connected');
      timerRef.current = setInterval(() => setDuration((d) => d + 1), 1000);
      if (isAndroidWebView()) (window as any).Android?.onCallStarted?.();
    } catch (err: any) {
      console.error('Error accepting call:', err);
      nativeCallLog(`acceptCall ERROR: ${err?.name} - ${err?.message}`);
      callInProgressRef.current = false;
      if (err?.name === 'NotAllowedError' || err?.name === 'NotFoundError') {
        alert(isAndroidWebView()
          ? 'Разрешите доступ к микрофону для звонков. Попробуйте принять снова.'
          : 'Разрешите доступ к микрофону в настройках браузера для совершения звонков');
        // Don't close — let user retry
        setCallState('incoming');
        return;
      }
      if (!callEndedRef.current) {
        setCallState('ended');
        cleanup();
      }
    }
  }, [incoming, cleanup, setupPeerHandlers]);

  // Decline incoming call
  const declineCall = useCallback(() => {
    if (incoming) {
      const socket = getSocket();
      socket?.emit('call_decline', { targetUserId: incoming.from });
    }
    callEndedRef.current = true;
    stopCallRingtone();
    setCallState('ended');
    cleanup();
    scheduleClose();
  }, [incoming, cleanup, scheduleClose]);

  // Toggle mic
  const toggleMic = () => {
    if (localStreamRef.current) {
      localStreamRef.current.getAudioTracks().forEach((t) => {
        t.enabled = !t.enabled;
      });
      setIsMuted(!isMuted);
    }
  };

  // Volume control for remote audio
  const handleVolumeChange = useCallback((vol: number) => {
    const v = Math.max(0, Math.min(1, vol));
    setRemoteVolume(v);
    if (remoteAudioRef.current) remoteAudioRef.current.volume = v;
  }, []);

  // Noise gate with look-ahead: analyse undelayed signal, gate delayed signal
  // This prevents clipping word beginnings and rejects short transients (clicks)
  const applyNoiseGate = useCallback(async () => {
    if (isAndroidWebView()) return; // AudioContext.createMediaStreamDestination is broken in Android WebView
    const pc = peerRef.current;
    if (!pc || !localStreamRef.current) return;
    const rawTrack = localStreamRef.current.getAudioTracks()[0];
    if (!rawTrack) return;

    try {
      const ctx = new AudioContext();
      const source = ctx.createMediaStreamSource(new MediaStream([rawTrack]));

      // Look-ahead delay: signal is delayed so gate can open before audio arrives
      const delayNode = ctx.createDelay(0.2);
      delayNode.delayTime.value = 0.05; // 50ms look-ahead

      // Analysis path: bandpass on voice fundamentals (undelayed, sees audio early)
      const analysisHP = ctx.createBiquadFilter();
      analysisHP.type = 'highpass'; analysisHP.frequency.value = 100; analysisHP.Q.value = 0.7;
      const analysisLP = ctx.createBiquadFilter();
      analysisLP.type = 'lowpass'; analysisLP.frequency.value = 4000; analysisLP.Q.value = 0.7;

      const analyser = ctx.createAnalyser();
      analyser.fftSize = 2048;
      analyser.smoothingTimeConstant = 0.3;

      const gainNode = ctx.createGain();
      gainNode.gain.value = 0;
      const dest = ctx.createMediaStreamDestination();

      // Signal path: source → delay → gain → output (full quality, just gated)
      source.connect(delayNode);
      delayNode.connect(gainNode);
      gainNode.connect(dest);

      // Analysis path (no delay): source → bandpass → analyser
      source.connect(analysisHP);
      analysisHP.connect(analysisLP);
      analysisLP.connect(analyser);

      const dataArray = new Float32Array(analyser.fftSize);
      const OPEN_THRESHOLD = -38;  // dB in voice band to trigger pending
      const CLOSE_THRESHOLD = -48; // dB hysteresis / transient rejection
      const CONFIRM_MS = 22;       // ms energy must persist to confirm voice (rejects clicks)
      const HOLD_TIME = 150;       // ms keep gate open after speech stops
      const ATTACK = 0.002;        // fast open (gate already decided ahead of time)
      const RELEASE = 0.02;        // smooth close

      // State machine: 0=closed, 1=pending (waiting to confirm voice), 2=open
      let state = 0;
      let pendingSince = 0;
      let holdUntil = 0;

      const check = () => {
        analyser.getFloatTimeDomainData(dataArray);
        let sum = 0;
        for (let i = 0; i < dataArray.length; i++) sum += dataArray[i] * dataArray[i];
        const rms = Math.sqrt(sum / dataArray.length);
        const db = rms > 0 ? 20 * Math.log10(rms) : -100;
        const now = performance.now();

        if (state === 0) { // closed
          if (db > OPEN_THRESHOLD) {
            state = 1; // pending
            pendingSince = now;
          }
        } else if (state === 1) { // pending — wait to confirm sustained energy (voice) vs transient (click)
          if (db <= CLOSE_THRESHOLD) {
            state = 0; // energy dropped fast → was a click, stay closed
          } else if (now - pendingSince >= CONFIRM_MS) {
            state = 2; // sustained → voice confirmed, open gate
            holdUntil = now + HOLD_TIME;
            gainNode.gain.setTargetAtTime(1, ctx.currentTime, ATTACK);
          }
        } else { // open
          if (db > CLOSE_THRESHOLD) {
            holdUntil = now + HOLD_TIME;
          }
          if (now >= holdUntil) {
            state = 0;
            gainNode.gain.setTargetAtTime(0, ctx.currentTime, RELEASE);
          }
        }
        noiseGateRafRef.current = requestAnimationFrame(check);
      };
      check();

      const gatedTrack = dest.stream.getAudioTracks()[0];
      gatedTrack.enabled = !isMuted;

      // Replace in PeerConnection
      const sender = pc.getSenders().find(s => s.track?.kind === 'audio');
      if (sender) await sender.replaceTrack(gatedTrack);

      noiseGateCtxRef.current = ctx;
      noiseGateGainRef.current = gainNode;
      noiseGateTrackRef.current = gatedTrack;
      setNoiseSuppression(true);
    } catch (err) {
      console.error('Failed to apply noise gate:', err);
    }
  }, [isMuted]);

  const removeNoiseGate = useCallback(async () => {
    const pc = peerRef.current;
    // Restore raw mic track directly to PeerConnection
    if (pc && localStreamRef.current) {
      const rawTrack = localStreamRef.current.getAudioTracks()[0];
      if (rawTrack) {
        const sender = pc.getSenders().find(s => s.track?.kind === 'audio');
        if (sender) await sender.replaceTrack(rawTrack);
      }
    }
    if (noiseGateRafRef.current) { cancelAnimationFrame(noiseGateRafRef.current); noiseGateRafRef.current = 0; }
    if (noiseGateTrackRef.current) { noiseGateTrackRef.current.stop(); noiseGateTrackRef.current = null; }
    if (noiseGateCtxRef.current) { noiseGateCtxRef.current.close().catch(() => {}); noiseGateCtxRef.current = null; }
    noiseGateGainRef.current = null;
    setNoiseSuppression(false);
  }, []);

  const toggleNoiseSuppression = useCallback(async () => {
    if (noiseSuppression) {
      await removeNoiseGate();
    } else {
      await applyNoiseGate();
    }
  }, [noiseSuppression, applyNoiseGate, removeNoiseGate]);

  // Enumerate speakers
  const refreshSpeakers = useCallback(async () => {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const audioOutputs = devices.filter(d => d.kind === 'audiooutput');
      setSpeakers(audioOutputs);
      return audioOutputs;
    } catch { return []; }
  }, []);

  // Switch speaker
  const switchSpeaker = useCallback(async (deviceId: string) => {
    setShowSpeakerMenu(false);
    try {
      if (remoteAudioRef.current) {
        if ('setSinkId' in remoteAudioRef.current) {
          (remoteAudioRef.current as any).setSinkId(deviceId).catch(() => {});
        }
      }
      setActiveSpeakerId(deviceId);
    } catch (err) {
      console.error('Switch speaker failed:', err);
    }
  }, []);

  // Enumerate microphones
  const refreshMicrophones = useCallback(async () => {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const audioInputs = devices.filter(d => d.kind === 'audioinput');
      setMicrophones(audioInputs);
      return audioInputs;
    } catch { return []; }
  }, []);

  // Switch microphone
  const switchMicrophone = useCallback(async (deviceId: string) => {
    const pc = peerRef.current;
    if (!pc) return;
    setShowMicMenu(false);
    try {
      const newStream = await navigator.mediaDevices.getUserMedia({
        audio: { deviceId: { exact: deviceId }, echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
      const newTrack = newStream.getAudioTracks()[0];
      if (!newTrack) return;
      newTrack.enabled = !isMuted;

      // Remove noise gate if active (will re-apply after switch if needed)
      const wasGated = noiseSuppression;
      if (wasGated) await removeNoiseGate();

      // Replace in local stream
      if (localStreamRef.current) {
        localStreamRef.current.getAudioTracks().forEach(t => {
          localStreamRef.current!.removeTrack(t);
          t.stop();
        });
        localStreamRef.current.addTrack(newTrack);
      }
      // Replace in PeerConnection
      const sender = pc.getSenders().find(s => s.track?.kind === 'audio');
      if (sender) await sender.replaceTrack(newTrack);
      setActiveMicId(deviceId);

      // Re-apply noise gate if it was active
      if (wasGated) await applyNoiseGate();
    } catch (err) {
      console.error('Switch mic failed:', err);
    }
  }, [isMuted, noiseSuppression, removeNoiseGate, applyNoiseGate]);

  // Enumerate cameras
  const refreshCameras = useCallback(async () => {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const videoInputs = devices.filter(d => d.kind === 'videoinput');
      setCameras(videoInputs);
      return videoInputs;
    } catch (e) {
      console.warn('Could not enumerate cameras:', e);
      return [];
    }
  }, []);

  // Open camera menu (await enumeration, then show)
  const openCameraMenu = useCallback(async () => {
    if (showCameraMenu) {
      setShowCameraMenu(false);
      return;
    }
    const cams = await refreshCameras();
    if (cams.length > 0) {
      setShowCameraMenu(true);
    }
  }, [showCameraMenu, refreshCameras]);

  // Switch to a specific camera by deviceId
  const switchCamera = useCallback(async (deviceId: string) => {
    const pc = peerRef.current;
    if (!pc) return;
    setShowCameraMenu(false);
    const prevCameraId = activeCameraId;

    try {
      // Strategy: try to acquire new camera FIRST without stopping the old one.
      // If that fails (some devices can't have 2 cameras open), stop old then retry.
      let newStream: MediaStream | null = null;

      try {
        newStream = await navigator.mediaDevices.getUserMedia({
          video: { deviceId: { exact: deviceId } },
        });
      } catch (e1) {
        console.warn('Could not open new camera while old is active, releasing old first:', e1);
        // Stop old camera tracks, then retry
        const currentSender = findVideoSender(pc);
        if (currentSender?.track) currentSender.track.stop();
        if (localStreamRef.current) {
          localStreamRef.current.getVideoTracks().forEach(t => {
            localStreamRef.current!.removeTrack(t);
            t.stop();
          });
        }
        newStream = await navigator.mediaDevices.getUserMedia({
          video: { deviceId: { exact: deviceId } },
        });
      }

      const newTrack = newStream.getVideoTracks()[0];
      if (!newTrack) {
        console.error('No video track from selected camera');
        return;
      }

      // Now stop old tracks (if they weren't stopped already in the fallback path above)
      const currentSender = findVideoSender(pc);
      if (localStreamRef.current) {
        localStreamRef.current.getVideoTracks().forEach(t => {
          if (t !== newTrack) {
            localStreamRef.current!.removeTrack(t);
            t.stop();
          }
        });
      }
      if (currentSender?.track && currentSender.track !== newTrack) {
        currentSender.track.stop();
      }

      // Replace track on sender or add new one
      if (currentSender) {
        await currentSender.replaceTrack(newTrack);
        // If direction was recvonly, change to sendrecv
        const transceiver = pc.getTransceivers().find(t => t.sender === currentSender);
        if (transceiver && (transceiver.direction === 'recvonly' || transceiver.direction === 'inactive')) {
          transceiver.direction = 'sendrecv';
          const offer = await pc.createOffer();
          await pc.setLocalDescription(offer);
          const socket = getSocket();
          socket?.emit('renegotiate', {
            targetUserId: targetUserIdRef.current,
            offer: pc.localDescription,
          });
        }
      } else {
        pc.addTrack(newTrack, localStreamRef.current || newStream);
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        const socket = getSocket();
        socket?.emit('renegotiate', {
          targetUserId: targetUserIdRef.current,
          offer: pc.localDescription,
        });
      }

      // Update local stream
      if (localStreamRef.current) {
        localStreamRef.current.addTrack(newTrack);
      } else {
        localStreamRef.current = new MediaStream([newTrack]);
      }

      setActiveCameraId(deviceId);
      setIsVideoOff(false);
      setCallType('video');
    } catch (err) {
      console.error('Switch camera failed:', err);
      // Try to restore previous camera so video isn't permanently lost
      try {
        let restoreStream: MediaStream | undefined;
        // Try the exact previous camera first
        if (prevCameraId) {
          try {
            restoreStream = await navigator.mediaDevices.getUserMedia({
              video: { deviceId: { exact: prevCameraId } },
            });
          } catch { /* previous camera also unavailable */ }
        }
        // Fall back to any camera
        if (!restoreStream) {
          try {
            restoreStream = await navigator.mediaDevices.getUserMedia({ video: true });
          } catch { /* no camera at all */ }
        }
        if (restoreStream) {
          const restoreTrack = restoreStream.getVideoTracks()[0];
          if (restoreTrack) {
            const sender = findVideoSender(pc);
            if (sender) {
              await sender.replaceTrack(restoreTrack);
              // Ensure direction allows sending + renegotiate
              const transceiver = pc.getTransceivers().find(t => t.sender === sender);
              if (transceiver && (transceiver.direction === 'recvonly' || transceiver.direction === 'inactive')) {
                transceiver.direction = 'sendrecv';
                const offer = await pc.createOffer();
                await pc.setLocalDescription(offer);
                const socket = getSocket();
                socket?.emit('renegotiate', {
                  targetUserId: targetUserIdRef.current,
                  offer: pc.localDescription,
                });
              }
            }
            if (localStreamRef.current) {
              localStreamRef.current.addTrack(restoreTrack);
            } else {
              localStreamRef.current = restoreStream;
            }
            setIsVideoOff(false);
          }
        }
      } catch { /* nothing we can do */ }
    }
  }, [activeCameraId]);

  // Toggle video: enable/disable video track, or get camera if none
  const toggleVideo = useCallback(async () => {
    const pc = peerRef.current;
    if (!pc) return;

    if (!isVideoOff) {
      // Turn off: disable video track on sender and revert to voice
      const sender = findVideoSender(pc);
      if (sender?.track) {
        sender.track.enabled = false;
      }
      setIsVideoOff(true);
      setCallType('voice');
    } else {
      // Turn on: re-enable existing track or get new camera
      const sender = findVideoSender(pc);
      if (sender?.track) {
        sender.track.enabled = true;
        setIsVideoOff(false);
      } else {
        try {
          const { stream: camStream, hasVideo } = await getMediaWithCameraFallback(true);
          if (!hasVideo) {
            console.warn('No camera available');
            return;
          }
          const videoTrack = camStream.getVideoTracks()[0];

          // Find a video sender (may have null track from transceiver)
          const existingSender = findVideoSender(pc);
          if (existingSender) {
            await existingSender.replaceTrack(videoTrack);
            // If direction was recvonly, change to sendrecv and renegotiate
            const transceiver = pc.getTransceivers().find(t => t.sender === existingSender);
            if (transceiver && (transceiver.direction === 'recvonly' || transceiver.direction === 'inactive')) {
              transceiver.direction = 'sendrecv';
              const offer = await pc.createOffer();
              await pc.setLocalDescription(offer);
              const socket = getSocket();
              socket?.emit('renegotiate', {
                targetUserId: targetUserIdRef.current,
                offer: pc.localDescription,
              });
            }
          } else {
            pc.addTrack(videoTrack, localStreamRef.current || camStream);
            // Renegotiate since new track added
            const offer = await pc.createOffer();
            await pc.setLocalDescription(offer);
            const socket = getSocket();
            socket?.emit('renegotiate', {
              targetUserId: targetUserIdRef.current,
              offer: pc.localDescription,
            });
          }

          if (localStreamRef.current) {
            localStreamRef.current.addTrack(videoTrack);
          }

          setIsVideoOff(false);
          setCallType('video');
        } catch (err) {
          console.error('Could not start camera:', err);
        }
      }
    }
  }, [isVideoOff]);

  // Screen sharing
  const toggleScreenShare = useCallback(async () => {
    const pc = peerRef.current;
    if (!pc) return;

    if (isScreenSharing) {
      // Stop screen share
      if (screenStreamRef.current) {
        screenStreamRef.current.getTracks().forEach(t => t.stop());
        screenStreamRef.current = null;
      }

      const hadVideo = hadVideoBeforeScreenShareRef.current;

      if (hadVideo) {
        // Restore camera — request video only (no audio) to avoid interfering with existing mic
        let cameraRestored = false;
        try {
          const constraints: MediaStreamConstraints = activeCameraId
            ? { video: { deviceId: { exact: activeCameraId } } }
            : { video: true };
          const camStream = await navigator.mediaDevices.getUserMedia(constraints);
          const cameraTrack = camStream.getVideoTracks()[0];
          if (cameraTrack) {
            const sender = findVideoSender(pc);
            if (sender) {
              await sender.replaceTrack(cameraTrack);
            }
            if (localStreamRef.current) {
              localStreamRef.current.getVideoTracks().forEach(t => {
                localStreamRef.current!.removeTrack(t);
                t.stop();
              });
              localStreamRef.current.addTrack(cameraTrack);
            }
            cameraRestored = true;
          }
        } catch (err) {
          console.error('Error restoring camera:', err);
        }
        if (!cameraRestored) {
          // Null out sender and go recvonly
          const sender = findVideoSender(pc);
          if (sender) {
            await sender.replaceTrack(null);
            const transceiver = pc.getTransceivers().find(t => t.sender === sender);
            if (transceiver && transceiver.direction !== 'recvonly') {
              transceiver.direction = 'recvonly';
              try {
                const offer = await pc.createOffer();
                await pc.setLocalDescription(offer);
                const socket = getSocket();
                socket?.emit('renegotiate', {
                  targetUserId: targetUserIdRef.current,
                  offer: pc.localDescription,
                });
              } catch (e) { console.error('Renegotiation after screen share stop failed:', e); }
            }
          }
          if (localStreamRef.current) {
            localStreamRef.current.getVideoTracks().forEach(t => {
              localStreamRef.current!.removeTrack(t);
              t.stop();
            });
          }
          setIsVideoOff(true);
        }
      } else {
        // Was voice call — don't restore camera, just null out the video sender
        const sender = findVideoSender(pc);
        if (sender) {
          await sender.replaceTrack(null);
          const transceiver = pc.getTransceivers().find(t => t.sender === sender);
          if (transceiver && transceiver.direction !== 'recvonly') {
            transceiver.direction = 'recvonly';
            try {
              const offer = await pc.createOffer();
              await pc.setLocalDescription(offer);
              const socket = getSocket();
              socket?.emit('renegotiate', {
                targetUserId: targetUserIdRef.current,
                offer: pc.localDescription,
              });
            } catch (e) { console.error('Renegotiation after screen share stop failed:', e); }
          }
        }
        if (localStreamRef.current) {
          localStreamRef.current.getVideoTracks().forEach(t => {
            localStreamRef.current!.removeTrack(t);
            t.stop();
          });
        }
        setCallType('voice');
        setIsVideoOff(false);
      }

      setIsScreenSharing(false);
    } else {
      // Start screen share — remember current video state
      hadVideoBeforeScreenShareRef.current = callType === 'video' && !isVideoOff;
      // In Electron, show source picker first
      const isElectron = typeof window !== 'undefined' && !!(window as any).electronAPI;
      if (isElectron) {
        setShowScreenSourcePicker(true);
        return;
      }
      // Browser: use standard getDisplayMedia
      startScreenShareWithMedia().catch((err) => {
        console.error('Error starting screen share:', err);
      });
    }
  }, [isScreenSharing, activeCameraId, callType, isVideoOff]);

  // Start screen share after getting media stream (browser or Electron after picker)
  const startScreenShareWithMedia = useCallback(async (screenStream?: MediaStream) => {
    const pc = peerRef.current;
    if (!pc) return;
    if (!screenStream) {
      try {
        screenStream = await navigator.mediaDevices.getDisplayMedia({
          video: { width: { ideal: 1920 }, height: { ideal: 1080 }, frameRate: { ideal: 30 } },
          audio: false,
        });
      } catch (err) {
        console.error('getDisplayMedia error:', err);
        return;
      }
    }
    screenStreamRef.current = screenStream;
    const screenTrack = screenStream.getVideoTracks()[0];

    // Find video sender and replace track
    const sender = findVideoSender(pc);
    if (sender) {
      await sender.replaceTrack(screenTrack);
      const transceiver = pc.getTransceivers().find(t => t.sender === sender);
      if (transceiver && (transceiver.direction === 'recvonly' || transceiver.direction === 'inactive')) {
        transceiver.direction = 'sendrecv';
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        const socket = getSocket();
        socket?.emit('renegotiate', {
          targetUserId: targetUserIdRef.current,
          offer: pc.localDescription,
        });
      }
    } else {
      // No video sender — add track associated with localStream to keep audio on same stream
      pc.addTrack(screenTrack, localStreamRef.current || screenStream);
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      const socket = getSocket();
      socket?.emit('renegotiate', {
        targetUserId: targetUserIdRef.current,
        offer: pc.localDescription,
      });
    }

    const handleScreenTrackEnded = async () => {
      setIsScreenSharing(false);
      if (screenStreamRef.current) {
        screenStreamRef.current.getTracks().forEach(t => t.stop());
        screenStreamRef.current = null;
      }

      const hadVideo = hadVideoBeforeScreenShareRef.current;
      const snd = peerRef.current ? findVideoSender(peerRef.current) : undefined;

      if (hadVideo) {
        // Restore camera — video only, no audio
        let cameraRestored = false;
        try {
          const constraints: MediaStreamConstraints = activeCameraId
            ? { video: { deviceId: { exact: activeCameraId } } }
            : { video: true };
          const camStream = await navigator.mediaDevices.getUserMedia(constraints);
          const camTrack = camStream.getVideoTracks()[0];
          if (camTrack) {
            if (snd) await snd.replaceTrack(camTrack);
            if (localStreamRef.current) {
              localStreamRef.current.getVideoTracks().forEach(t => {
                localStreamRef.current!.removeTrack(t);
                t.stop();
              });
              localStreamRef.current.addTrack(camTrack);
            }
            cameraRestored = true;
          }
        } catch (e) {
          console.error('Error restoring camera:', e);
        }
        if (!cameraRestored && snd) {
          await snd.replaceTrack(null);
          const currentPc = peerRef.current;
          if (currentPc) {
            const transceiver = currentPc.getTransceivers().find(t => t.sender === snd);
            if (transceiver && transceiver.direction !== 'recvonly') {
              transceiver.direction = 'recvonly';
              try {
                const offer = await currentPc.createOffer();
                await currentPc.setLocalDescription(offer);
                const socket = getSocket();
                socket?.emit('renegotiate', {
                  targetUserId: targetUserIdRef.current,
                  offer: currentPc.localDescription,
                });
              } catch (e) { console.error('Renegotiation after screen share onended failed:', e); }
            }
          }
          if (localStreamRef.current) {
            localStreamRef.current.getVideoTracks().forEach(t => {
              localStreamRef.current!.removeTrack(t);
              t.stop();
            });
          }
        }
      } else {
        // Was voice call — just null out video sender
        if (snd) {
          await snd.replaceTrack(null);
          const currentPc = peerRef.current;
          if (currentPc) {
            const transceiver = currentPc.getTransceivers().find(t => t.sender === snd);
            if (transceiver && transceiver.direction !== 'recvonly') {
              transceiver.direction = 'recvonly';
              try {
                const offer = await currentPc.createOffer();
                await currentPc.setLocalDescription(offer);
                const socket = getSocket();
                socket?.emit('renegotiate', {
                  targetUserId: targetUserIdRef.current,
                  offer: currentPc.localDescription,
                });
              } catch (e) { console.error('Renegotiation after screen share onended failed:', e); }
            }
          }
        }
        if (localStreamRef.current) {
          localStreamRef.current.getVideoTracks().forEach(t => {
            localStreamRef.current!.removeTrack(t);
            t.stop();
          });
        }
        setCallType('voice');
      }
    };

    screenTrack.onended = handleScreenTrackEnded;
    setIsScreenSharing(true);
    setCallType('video');
  }, [activeCameraId, localStreamRef.current]);

  // Handle screen source selection in Electron
  const handleScreenSourceSelect = useCallback(async (sourceId: string) => {
    try {
      const screenStream = await navigator.mediaDevices.getUserMedia({
        video: {
          mandatory: {
            chromeMediaSource: 'desktop',
            chromeMediaSourceId: sourceId,
            maxWidth: 1920,
            maxHeight: 1080,
            maxFrameRate: 30,
          } as any,
        },
        audio: false,
      } as any);
      await startScreenShareWithMedia(screenStream);
    } catch (err) {
      console.error('Error getting screen stream:', err);
    }
  }, [startScreenShareWithMedia]);

  // Fullscreen toggle
  const toggleFullscreen = useCallback(async () => {
    if (!videoContainerRef.current) return;
    try {
      if (!document.fullscreenElement) {
        await videoContainerRef.current.requestFullscreen();
        setIsFullscreen(true);
      } else {
        await document.exitFullscreen();
        setIsFullscreen(false);
      }
    } catch (e) {
      console.error('Fullscreen error:', e);
    }
  }, []);

  useEffect(() => {
    const onFsChange = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', onFsChange);
    return () => document.removeEventListener('fullscreenchange', onFsChange);
  }, []);

  // Socket event listeners
  useEffect(() => {
    const socket = getSocket();
    if (!socket) return;

    const onCallAnswered = async (data: { from: string; answer: RTCSessionDescriptionInit }) => {
      if (!peerRef.current || data.from !== targetUserIdRef.current) return;
      nativeCallLog(`call_answered from=${data.from}`);
      if (callTimeoutRef.current) clearTimeout(callTimeoutRef.current);
      stopCallRingtone();
      console.log('[onCallAnswered] Setting remote description (answer)');
      await peerRef.current.setRemoteDescription(new RTCSessionDescription(data.answer));
      console.log('[onCallAnswered] Transceivers after answer:',
        peerRef.current.getTransceivers().map(t => ({
          mid: t.mid,
          direction: t.direction,
          currentDirection: t.currentDirection,
          senderTrack: t.sender?.track?.kind ?? null,
          receiverTrack: t.receiver?.track?.kind ?? null,
        })));
      for (const candidate of iceCandidateBufferRef.current) {
        peerRef.current?.addIceCandidate(new RTCIceCandidate(candidate)).catch(console.error);
      }
      iceCandidateBufferRef.current = [];
      setCallState('connected');
      timerRef.current = setInterval(() => setDuration((d) => d + 1), 1000);
      // Notify Android: call started → switch to earpiece
      if (isAndroidWebView()) (window as any).Android?.onCallStarted?.();
    };

    const onIceCandidate = (data: { from: string; candidate: RTCIceCandidateInit }) => {
      if (peerRef.current && peerRef.current.remoteDescription) {
        peerRef.current.addIceCandidate(new RTCIceCandidate(data.candidate)).catch(console.error);
      } else {
        iceCandidateBufferRef.current.push(data.candidate);
      }
    };

    // On call connect, explicitly ensure earpiece is ON on Android (once per call).
    // Without this, speaker may be left on from a previous call.
    useEffect(() => {
      if (callState === 'connected' && !earpieceEnsuredRef.current) {
        earpieceEnsuredRef.current = true;
        if (isAndroidWebView()) {
          (window as any).Android?.setSpeakerOn?.(false);
        }
        setIsEarpieceMode(true);
      }
      if (callState === 'idle' || callState === 'ended') {
        earpieceEnsuredRef.current = false;
      }
    }, [callState]);

    const onCallEnded = (data: { from: string }) => {
      nativeCallLog(`call_ended from=${data.from}`);
      if (callEndedRef.current) return;
      if (data.from !== targetUserIdRef.current) return;
      callEndedRef.current = true;
      stopCallRingtone();
      setCallState('ended');
      cleanup();
      scheduleClose();
    };

    const onCallDeclined = (data: { from: string }) => {
      if (callEndedRef.current) return;
      if (data.from !== targetUserIdRef.current) return;
      callEndedRef.current = true;
      stopCallRingtone();
      setCallState('ended');
      cleanup();
      scheduleClose();
    };

    const onCallUnavailable = () => {
      if (callEndedRef.current) return;
      callEndedRef.current = true;
      stopCallRingtone();
      setCallState('ended');
      cleanup();
      scheduleClose();
    };

    // Renegotiation (e.g. when remote adds screen share to audio-only call)
    const onRenegotiate = async (data: { from: string; offer: RTCSessionDescriptionInit }) => {
      if (!peerRef.current || data.from !== targetUserIdRef.current) return;
      try {
        await peerRef.current.setRemoteDescription(new RTCSessionDescription(data.offer));
        const answer = await peerRef.current.createAnswer();
        await peerRef.current.setLocalDescription(answer);
        socket.emit('renegotiate_answer', {
          targetUserId: targetUserIdRef.current,
          answer: peerRef.current.localDescription,
        });
      } catch (err) {
        console.error('Renegotiation error:', err);
      }
    };

    const onRenegotiateAnswer = async (data: { from: string; answer: RTCSessionDescriptionInit }) => {
      if (!peerRef.current || data.from !== targetUserIdRef.current) return;
      try {
        await peerRef.current.setRemoteDescription(new RTCSessionDescription(data.answer));
      } catch (err) {
        console.error('Renegotiation answer error:', err);
      }
    };

    socket.on('call_answered', onCallAnswered);
    socket.on('ice_candidate', onIceCandidate);
    socket.on('call_ended', onCallEnded);
    socket.on('call_declined', onCallDeclined);
    socket.on('call_unavailable', onCallUnavailable);
    socket.on('renegotiate', onRenegotiate);
    socket.on('renegotiate_answer', onRenegotiateAnswer);

    return () => {
      socket.off('call_answered', onCallAnswered);
      socket.off('ice_candidate', onIceCandidate);
      socket.off('call_ended', onCallEnded);
      socket.off('call_declined', onCallDeclined);
      socket.off('call_unavailable', onCallUnavailable);
      socket.off('renegotiate', onRenegotiate);
      socket.off('renegotiate_answer', onRenegotiateAnswer);
    };
  }, [cleanup, scheduleClose]);

  // Start call on mount (outgoing) — use ref to prevent double-trigger
  const startCallRef = useRef(startCall);
  startCallRef.current = startCall;
  useEffect(() => {
    if (isOpen && !incoming && targetUser && callState === 'idle' && !callInProgressRef.current) {
      startCallRef.current();
    }
    if (isOpen && incoming && callState === 'idle') {
      targetUserIdRef.current = incoming.from;
      setCallState('incoming');
      setCallType(incoming.callType);
      playCallRingtone();
    }
  }, [isOpen, incoming, targetUser, callState]);

  // Sync local video ref with stream — set unconditionally so any track additions/changes
  // (e.g. adding video after a voice call starts) are reflected immediately.
  useEffect(() => {
    if (!localVideoRef.current) return;
    const desired = isScreenSharing && screenStreamRef.current
      ? screenStreamRef.current
      : localStreamRef.current;
    if (desired) {
      localVideoRef.current.srcObject = desired;
    }
  }, [localStreamRef.current, screenStreamRef.current, isScreenSharing]);

  // Sync remote video ref with remote stream (only when srcObject actually changes)
  useEffect(() => {
    if (!remoteVideoRef.current) return;
    if (remoteStreamRef.current && remoteVideoRef.current.srcObject !== remoteStreamRef.current) {
      remoteVideoRef.current.srcObject = remoteStreamRef.current;
    }
  });

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopCallRingtone();
      if (closeTimeoutRef.current) clearTimeout(closeTimeoutRef.current);
      cleanup();
    };
  }, [cleanup]);

  const formatDuration = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const displayName = incoming
    ? incoming.callerInfo?.displayName || incoming.callerInfo?.username || '...'
    : targetUser?.displayName || targetUser?.username || '...';

  const displayAvatar = incoming
    ? incoming.callerInfo?.avatar
    : targetUser?.avatar;

  const initials = displayName
    .split(' ')
    .map((w: string) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  if (!isOpen) return null;

  const isElectron = typeof window !== 'undefined' && !!(window as any).electronAPI;
  const showVideoArea = callState === 'connected' && (hasRemoteVideo || (callType === 'video' && (!isVideoOff || isScreenSharing)));
  const hasLocalVideo = !!(
    localStreamRef.current?.getVideoTracks().some(t => t.enabled) || isScreenSharing
  );

  return (
    <>
      <audio key="remote-audio" ref={remoteAudioRef} autoPlay playsInline />
      {/* === MOBILE CALL UI === */}
      {isMobile && !isMinimized && (callState === 'calling' || callState === 'connected' || callState === 'incoming' || showNoAnswerScreen) && (
        <div
          key="mobile-call"
          className="call-modal-fade-in fixed inset-0 z-[100] flex flex-col overflow-hidden"
          style={{ background: 'linear-gradient(180deg, #0a0a0f 0%, #111118 40%, #111118 60%, #0a0a0f 100%)' }}
        >
          {/* Hidden video elements */}
          <video ref={remoteVideoRef} autoPlay playsInline muted className="hidden" />
          <video ref={localVideoRef} autoPlay playsInline muted className="hidden" />

          {/* ========== CONNECTED + REMOTE VIDEO → Fullscreen remote ========== */}
          {callState === 'connected' && hasRemoteVideo ? (
            <>
              {/* Remote video fullscreen */}
              <div className="absolute inset-0 bg-black">
                <video
                  ref={remoteVideoRef}
                  autoPlay
                  playsInline
                  muted
                  className="w-full h-full object-contain bg-black"
                />
              </div>

              {/* Name + duration at top */}
              <div className="absolute top-0 left-0 right-0 z-20 bg-gradient-to-b from-black/70 to-transparent pt-12 pb-8 px-4">
                <p className="text-lg font-bold text-white text-center">{displayName}</p>
                <p className="text-sm text-white/70 font-mono text-center">{formatDuration(duration)}</p>
              </div>

              {/* Local camera PIP — bottom-right, above call buttons (z-30) */}
              {hasLocalVideo && (
                <div className="absolute bottom-36 right-4 z-30 w-36 rounded-2xl overflow-hidden border-2 border-white/20 shadow-2xl bg-black"
                  style={{ aspectRatio: '9 / 16' }}
                >
                  <video
                    ref={localVideoRef}
                    autoPlay
                    playsInline
                    muted
                    className="w-full h-full object-cover"
                  />
                  {/* "Вы" label */}
                  <div className="absolute bottom-1.5 left-1.5 px-2 py-0.5 rounded-full bg-black/50 text-[10px] text-white font-medium">
                    Вы
                  </div>
                  {/* Switch camera button */}
                  <button
                    onClick={async () => {
                      try {
                        const devices = await navigator.mediaDevices.enumerateDevices();
                        const cameras = devices.filter(d => d.kind === 'videoinput');
                        if (cameras.length < 2) return;
                        const currentIdx = cameras.findIndex(c => c.deviceId === activeCameraId);
                        const nextCam = cameras[(currentIdx + 1) % cameras.length];
                        const sender = peerRef.current?.getSenders().find(s => s.track?.kind === 'video');
                        if (sender && nextCam) {
                          const newStream = await navigator.mediaDevices.getUserMedia({ video: { deviceId: { exact: nextCam.deviceId } } });
                          const newTrack = newStream.getVideoTracks()[0];
                          await sender.replaceTrack(newTrack);
                          // Update local video element
                          if (localStreamRef.current) {
                            const oldVideoTracks = localStreamRef.current.getVideoTracks();
                            oldVideoTracks.forEach(t => { t.stop(); localStreamRef.current?.removeTrack(t); });
                            localStreamRef.current.addTrack(newTrack);
                          }
                          if (localVideoRef.current) {
                            localVideoRef.current.srcObject = localStreamRef.current;
                          }
                          setActiveCameraId(nextCam.deviceId);
                        }
                      } catch (e) { console.warn('Camera switch failed:', e); }
                    }}
                    className="absolute top-1.5 right-1.5 w-7 h-7 rounded-full bg-black/50 flex items-center justify-center text-white"
                  >
                    <SwitchCamera size={14} />
                  </button>
                </div>
              )}

              {/* 4 buttons bottom — higher z than local PIP (z-20) */}
              <div className="absolute bottom-0 left-0 right-0 pb-12 pt-6 bg-gradient-to-t from-black/70 to-transparent z-30">
                <div className="flex items-center justify-center">
                  <div className="flex items-center gap-5 bg-white/10 rounded-full px-6 py-3.5 backdrop-blur-sm border border-white/5">
                    <button onClick={toggleEarpiece} className={`w-14 h-14 rounded-full flex items-center justify-center transition-all ${!isEarpieceMode ? 'bg-vortex-500 text-white shadow-lg shadow-vortex-500/30' : 'bg-white/10 text-white/70'}`}>
                      <Volume2 size={22} />
                    </button>
                    <button onClick={toggleMic} className={`w-14 h-14 rounded-full flex items-center justify-center transition-all ${isMuted ? 'bg-red-500 text-white shadow-lg shadow-red-500/30' : 'bg-white/10 text-white/70'}`}>
                      {isMuted ? <MicOff size={22} /> : <Mic size={22} />}
                    </button>
                    <button onClick={toggleMobileCamera} className={`w-14 h-14 rounded-full flex items-center justify-center transition-all ${(!isVideoOff && callType === 'video') ? 'bg-vortex-500 text-white shadow-lg shadow-vortex-500/30' : 'bg-white/10 text-white/70'}`}>
                      {(!isVideoOff && callType === 'video') ? <Video size={22} /> : <VideoOff size={22} />}
                    </button>
                    <button onClick={endCallSafe} className="w-14 h-14 rounded-full bg-red-500 flex items-center justify-center text-white shadow-lg shadow-red-500/30">
                      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M10.68 13.31a16 16 0 0 0 3.41 2.6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7 2 2 0 0 1 1.72 2v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 2.59 3.4z" transform="rotate(135 12 12)" />
                      </svg>
                    </button>
                  </div>
                </div>
              </div>
            </>
          ) : showNoAnswerScreen ? (
            /* ========== NO ANSWER SCREEN ========== */
            <div className="flex-1 flex flex-col items-center justify-end px-8 pb-16 pt-8">
              <div className="flex-1 flex flex-col items-center justify-center">
                <div className="relative mb-4">
                  <div className="absolute inset-[-24px] rounded-full bg-red-500/15 blur-2xl" />
                  {displayAvatar ? (
                    <img src={displayAvatar} alt="" className="relative w-36 h-36 rounded-full object-cover opacity-50" />
                  ) : (
                    <div className="relative w-36 h-36 rounded-full bg-gradient-to-br from-vortex-500/50 to-purple-600/50 flex items-center justify-center text-white font-bold text-4xl">
                      {initials}
                    </div>
                  )}
                </div>
                <p className="text-lg font-bold text-white">{displayName}</p>
              </div>
              {/* 3 buttons at bottom */}
              <div className="flex items-center gap-8">
                <button onClick={() => { setShowNoAnswerScreen(false); onClose(); }} className="flex flex-col items-center gap-2">
                  <div className="w-16 h-16 rounded-full bg-white/10 flex items-center justify-center text-white">
                    <X size={24} />
                  </div>
                  <span className="text-xs text-zinc-400">Закрыть</span>
                </button>
                <button onClick={() => { setShowNoAnswerScreen(false); onClose(); window.dispatchEvent(new CustomEvent('vortex:open-chat', { detail: { userId: targetUser?.id } })); }} className="flex flex-col items-center gap-2">
                  <div className="w-16 h-16 rounded-full bg-vortex-500/20 flex items-center justify-center text-vortex-400">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
                  </div>
                  <span className="text-xs text-zinc-400">Написать</span>
                </button>
                <button onClick={() => { setShowNoAnswerScreen(false); callEndedRef.current = false; setCallState('idle'); setTimeout(() => setCallState('calling'), 100); }} className="flex flex-col items-center gap-2">
                  <div className="w-16 h-16 rounded-full bg-emerald-500/20 flex items-center justify-center text-emerald-400">
                    <Phone size={24} />
                  </div>
                  <span className="text-xs text-zinc-400">Перезвонить</span>
                </button>
              </div>
            </div>
          ) : (
            /* ========== VOICE CALL (calling / connected without video / incoming) ========== */
            <>
              {/* Minimize button — ONLY when connected */}
              {callState === 'connected' && (
                <div className="px-4 pt-12 pb-2 z-10">
                  <button onClick={() => setIsMinimized(true)} className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center text-white/70">
                    <Minus size={20} />
                  </button>
                </div>
              )}

              {/* Avatar + name + status */}
              <div className="flex-1 flex flex-col items-center justify-center px-8">
                {/* Name + status text — show always */}
                <p className="text-xl font-bold text-white mb-1">{displayName}</p>
                <p className="text-sm text-zinc-400 font-mono mb-6">
                  {callState === 'calling' ? 'Вызов...' :
                   callState === 'connected' ? formatDuration(duration) :
                   callState === 'incoming' ? (callType === 'video' ? 'Видеозвонок' : 'Звонок') : ''}
                </p>
                <div className="relative mb-6">
                  {(callState === 'calling' || callState === 'connected') && (
                    <>
                      <div className="absolute inset-[-24px] rounded-full bg-vortex-500/10 blur-xl animate-pulse" style={{ animationDuration: '3s' }} />
                      <div className="absolute inset-[-14px] rounded-full border-2 border-vortex-500/20 animate-call-wave" />
                      <div className="absolute inset-[-6px] rounded-full border border-vortex-500/10 animate-call-wave-delayed" />
                    </>
                  )}
                  {callState === 'incoming' && (
                    <>
                      <div className="absolute inset-[-24px] rounded-full bg-emerald-500/10 blur-xl animate-pulse" style={{ animationDuration: '3s' }} />
                      <div className="absolute inset-[-14px] rounded-full border-2 border-emerald-500/20 animate-call-wave" />
                      <div className="absolute inset-[-6px] rounded-full border border-emerald-500/10 animate-call-wave-delayed" />
                    </>
                  )}
                  <div className="relative z-10 p-1.5 rounded-full bg-gradient-to-br from-white/10 to-transparent border border-white/10 shadow-2xl">
                    {displayAvatar ? (
                      <img src={displayAvatar} alt="" className="w-36 h-36 rounded-full object-cover" />
                    ) : (
                      <div className="w-36 h-36 rounded-full bg-gradient-to-br from-vortex-500 to-purple-600 flex items-center justify-center text-white font-bold text-5xl">
                        {initials}
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Bottom buttons — different for each state */}
              <div className="pb-12 px-6 z-10">
                {callState === 'incoming' ? (
                  /* INCOMING: 2 big buttons — decline + accept */
                  <div className="flex items-center justify-center gap-12">
                    <button onClick={declineCall} className="flex flex-col items-center gap-2">
                      <div className="w-[68px] h-[68px] rounded-full bg-red-500 flex items-center justify-center text-white shadow-xl shadow-red-500/30">
                        <PhoneOff size={28} />
                      </div>
                      <span className="text-xs text-zinc-400">Отклонить</span>
                    </button>
                    <button onClick={acceptCall} className="flex flex-col items-center gap-2">
                      <div className="w-[68px] h-[68px] rounded-full bg-emerald-500 flex items-center justify-center text-white shadow-xl shadow-emerald-500/30 animate-pulse">
                        <Phone size={28} className="animate-bounce" />
                      </div>
                      <span className="text-xs text-zinc-400">Принять</span>
                    </button>
                  </div>
                ) : (
                  /* OUTGOING + CONNECTED: 4 buttons in oval */
                  <div className="flex items-center justify-center">
                    <div className="flex items-center gap-5 bg-white/10 rounded-full px-6 py-3.5 backdrop-blur-sm border border-white/5">
                      <button onClick={toggleEarpiece} className={`w-14 h-14 rounded-full flex items-center justify-center transition-all ${!isEarpieceMode ? 'bg-vortex-500 text-white shadow-lg shadow-vortex-500/30' : 'bg-white/10 text-white/70'}`}>
                        <Volume2 size={22} />
                      </button>
                      <button onClick={toggleMic} className={`w-14 h-14 rounded-full flex items-center justify-center transition-all ${isMuted ? 'bg-red-500 text-white shadow-lg shadow-red-500/30' : 'bg-white/10 text-white/70'}`}>
                        {isMuted ? <MicOff size={22} /> : <Mic size={22} />}
                      </button>
                      <button onClick={toggleMobileCamera} className={`w-14 h-14 rounded-full flex items-center justify-center transition-all ${(!isVideoOff && callType === 'video') ? 'bg-vortex-500 text-white shadow-lg shadow-vortex-500/30' : 'bg-white/10 text-white/70'}`}>
                        {(!isVideoOff && callType === 'video') ? <Video size={22} /> : <VideoOff size={22} />}
                      </button>
                      <button onClick={endCallSafe} className="w-14 h-14 rounded-full bg-red-500 flex items-center justify-center text-white shadow-lg shadow-red-500/30">
                        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M10.68 13.31a16 16 0 0 0 3.41 2.6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7 2 2 0 0 1 1.72 2v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 2.59 3.4z" transform="rotate(135 12 12)" />
                        </svg>
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      )}

      {/* === MINIMIZED VIEW === */}
      {isMinimized && callState === 'connected' ? (
        <div
          key="call-minimized"
          className="call-modal-pop-in fixed bottom-6 right-6 z-[100] flex items-center gap-3 px-4 py-3 rounded-2xl glass-strong shadow-2xl shadow-black/50 border border-white/10 cursor-pointer select-none"
          onClick={() => setIsMinimized(false)}
        >
          {/* Avatar */}
          <div className="relative">
            <div className="absolute inset-0 rounded-full bg-vortex-500/30 animate-call-wave" />
            {displayAvatar ? (
              <img src={displayAvatar} alt="" className="relative w-10 h-10 rounded-full object-cover" />
            ) : (
              <div className="relative w-10 h-10 rounded-full bg-gradient-to-br from-vortex-500 to-purple-600 flex items-center justify-center text-white font-bold text-sm">
                {initials}
              </div>
            )}
          </div>
          <div className="min-w-0">
            <p className="text-sm text-white font-medium truncate max-w-[120px]">{displayName}</p>
            <p className="text-xs text-zinc-400 font-mono">{formatDuration(duration)}</p>
          </div>
          {/* Quick controls */}
          <div className="flex items-center gap-2 ml-2" onClick={(e) => e.stopPropagation()}>
            <button
              onClick={toggleMic}
              className={`w-8 h-8 rounded-full flex items-center justify-center transition-colors ${isMuted ? 'bg-red-500/20 text-red-400' : 'bg-white/10 text-white hover:bg-white/20'}`}
            >
              {isMuted ? <MicOff size={14} /> : <Mic size={14} />}
            </button>
            <button
              onClick={endCallSafe}
              className="w-8 h-8 rounded-full bg-red-500 hover:bg-red-600 flex items-center justify-center text-white transition-colors"
            >
              <PhoneOff size={14} />
            </button>
          </div>
          {/* Hidden remote video to keep stream alive */}
          <video ref={remoteVideoRef} autoPlay playsInline muted className="hidden" />
          <video ref={localVideoRef} autoPlay playsInline muted className="hidden" />
        </div>
      ) : (!isMobile || callState === 'idle') && (

      /* === FULL VIEW (desktop only) === */
      <div
        key="call-overlay"
        className="call-modal-fade-in"
        role="dialog"
        aria-modal="true"
        aria-label="Call"
        className="fixed inset-0 z-[100] flex items-center justify-center bg-surface/90 backdrop-blur-xl overflow-hidden"
        onClick={() => { setShowCameraMenu(false); setShowVolumeSlider(false); setShowMicMenu(false); }}
      >
        {/* Ambient background glow for call modal */}
        <div className="absolute inset-0 pointer-events-none opacity-40">
          <div className="absolute top-[10%] left-[20%] w-[50vh] h-[50vh] bg-vortex-500/30 rounded-full blur-[120px] animate-float" />
          <div className="absolute bottom-[10%] right-[20%] w-[50vh] h-[50vh] bg-emerald-500/20 rounded-full blur-[120px] animate-float-delayed" />
        </div>

        <div
          className={`call-modal-pop-in relative w-full mx-4 rounded-[2.5rem] glass-strong shadow-2xl shadow-black/50 overflow-hidden border border-white/5 ${showVideoArea ? 'max-w-5xl' : 'max-w-md'
            }`}
        >
          {/* CustomTitleBar in App.tsx handles window controls — no need for duplicate here */}

          {/* Mic selector popup */}
          {showMicMenu && microphones.length > 0 && (
            <>
              <div className="fixed inset-0 z-[200]" onClick={() => setShowMicMenu(false)} />
              <div className="fixed z-[201] left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[320px] rounded-xl bg-zinc-800/95 backdrop-blur-md border border-zinc-600 shadow-2xl py-2">
                <div className="px-3 py-1.5 text-xs text-zinc-400 uppercase tracking-wider border-b border-zinc-700 mb-1">{t('selectMicrophone')}</div>
                {microphones.map((mic, i) => (
                  <button
                    key={mic.deviceId}
                    onClick={() => switchMicrophone(mic.deviceId)}
                    className={`w-full text-left px-4 py-2.5 text-sm transition-colors ${activeMicId === mic.deviceId
                        ? 'text-vortex-400 bg-vortex-500/20 font-medium'
                        : 'text-zinc-200 hover:bg-zinc-700'
                      }`}
                  >
                    {mic.label || `${t('microphone')} ${i + 1}`}
                  </button>
                ))}
              </div>
            </>
          )}
          {/* Camera selector popup - rendered outside overflow-hidden container */}
          {showCameraMenu && cameras.length > 0 && (
            <>
              {/* Backdrop to close on click outside */}
              <div className="fixed inset-0 z-[200]" onClick={() => setShowCameraMenu(false)} />
              <div className="fixed z-[201] left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[300px] rounded-xl bg-zinc-800/95 backdrop-blur-md border border-zinc-600 shadow-2xl py-2">
                <div className="px-3 py-1.5 text-xs text-zinc-400 uppercase tracking-wider border-b border-zinc-700 mb-1">{t('switchCamera')}</div>
                {cameras.map((cam, i) => (
                  <button
                    key={cam.deviceId}
                    onClick={() => switchCamera(cam.deviceId)}
                    className={`w-full text-left px-4 py-2.5 text-sm transition-colors ${activeCameraId === cam.deviceId
                        ? 'text-vortex-400 bg-vortex-500/20 font-medium'
                        : 'text-zinc-200 hover:bg-zinc-700'
                      }`}
                  >
                    {cam.label || `Camera ${i + 1}`}
                  </button>
                ))}
              </div>
            </>
          )}
          {/* Volume slider popup */}
          {showVolumeSlider && (
            <>
              <div className="fixed inset-0 z-[200]" onClick={() => setShowVolumeSlider(false)} />
              <div className="fixed z-[201] left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[250px] rounded-xl bg-zinc-800/95 backdrop-blur-md border border-zinc-600 shadow-2xl p-4" onClick={(e) => e.stopPropagation()}>
                <div className="text-xs text-zinc-400 uppercase tracking-wider mb-3">{t('volume')}</div>
                <div className="flex items-center gap-3">
                  <Volume2 size={16} className="text-zinc-400 shrink-0" />
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.05"
                    value={remoteVolume}
                    onChange={(e) => handleVolumeChange(parseFloat(e.target.value))}
                    className="h-1.5 rounded-full appearance-none bg-zinc-600 accent-vortex-500 cursor-pointer flex-1"
                    style={{ width: 'calc(100% - 56px)' }}
                  />
                  <span className="text-xs text-zinc-300 w-8 text-right shrink-0">{Math.round(remoteVolume * 100)}%</span>
                </div>
              </div>
            </>
          )}
          {/* === Video layout (connected, has video) === */}
          {showVideoArea ? (
            <div
              ref={videoContainerRef}
              className="relative bg-black w-full"
              style={{ aspectRatio: '16 / 9' }}
            >
              {/* Remote video — fills container, preserves natural aspect ratio */}
              {hasRemoteVideo ? (
                <video
                  ref={remoteVideoRef}
                  autoPlay
                  playsInline
                  muted
                  className="absolute inset-0 w-full h-full object-contain bg-black"
                  onContextMenu={(e) => { e.preventDefault(); setShowVolumeSlider(true); }}
                />
              ) : (
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <VideoOff size={48} className="text-zinc-500 mb-2" />
                  <span className="text-sm text-zinc-500">{displayName}</span>
                  {/* Hidden video to keep stream alive */}
                  <video ref={remoteVideoRef} autoPlay playsInline muted className="hidden" />
                </div>
              )}

              {/* Local video PIP (bottom-right, above controls) */}
              {hasLocalVideo && (
                <div className="absolute bottom-3 right-3 w-48 rounded-xl overflow-hidden border-2 border-white/20 shadow-lg bg-black z-20"
                  style={{ aspectRatio: '16 / 9' }}
                >
                  <video
                    ref={localVideoRef}
                    autoPlay
                    playsInline
                    muted
                    className="w-full h-full object-contain bg-black"
                  />
                </div>
              )}

              {/* Duration badge */}
              <div className="absolute top-4 left-1/2 -translate-x-1/2 px-4 py-1 rounded-full bg-black/50 backdrop-blur-sm z-10">
                <span className="text-sm text-white font-mono">{formatDuration(duration)}</span>
              </div>

              {/* Top-right buttons: minimize + fullscreen (only in browser) */}
              {!isElectron && (
                <div className="absolute top-4 right-4 flex items-center gap-2 z-10">
                  <button
                    onClick={() => setIsMinimized(true)}
                    className="w-8 h-8 rounded-full bg-black/50 backdrop-blur-sm flex items-center justify-center text-white/70 hover:text-white transition-colors"
                    title={t('minimize')}
                  >
                    <Minimize2 size={16} />
                  </button>
                  <button
                    onClick={toggleFullscreen}
                    className="w-8 h-8 rounded-full bg-black/50 backdrop-blur-sm flex items-center justify-center text-white/70 hover:text-white transition-colors"
                  >
                    {isFullscreen ? <Minimize size={16} /> : <Maximize size={16} />}
                  </button>
                </div>
              )}
            </div>
          ) : (
            /* === Voice / calling / incoming layout === */
            <div className="px-8 py-12 flex flex-col items-center relative z-10">
              {/* Minimize button (top-right) */}
              {callState === 'connected' && (
                <button
                  onClick={() => setIsMinimized(true)}
                  className="absolute top-4 right-4 w-8 h-8 rounded-full bg-white/10 flex items-center justify-center text-white/70 hover:text-white transition-colors"
                  title={t('minimize')}
                >
                  <Minimize2 size={16} />
                </button>
              )}
              {/* Avatar with pulse — right-click for volume */}
              <div
                className="relative mb-8 mt-4"
                onContextMenu={(e) => {
                  if (callState === 'connected') {
                    e.preventDefault();
                    setShowVolumeSlider(true);
                  }
                }}
                title={callState === 'connected' ? t('rightClickVolume') : undefined}
              >
                {(callState === 'calling' || callState === 'connected') && (
                  <>
                    <div className="absolute inset-0 rounded-full bg-vortex-500/30 animate-call-wave" />
                    <div className="absolute inset-0 rounded-full bg-vortex-500/20 animate-call-wave-delayed" />
                  </>
                )}
                {callState === 'incoming' && (
                  <>
                    <div className="absolute inset-0 rounded-full bg-emerald-500/30 animate-call-wave" />
                    <div className="absolute inset-0 rounded-full bg-emerald-500/20 animate-call-wave-delayed" />
                  </>
                )}
                <div className="relative z-10 p-1.5 rounded-full bg-gradient-to-br from-white/10 to-transparent backdrop-blur-md border border-white/10 shadow-2xl cursor-pointer">
                  {displayAvatar ? (
                    <img src={displayAvatar} alt="" className="w-32 h-32 rounded-full object-cover shadow-inner" />
                  ) : (
                    <div className="w-32 h-32 rounded-full bg-gradient-to-br from-vortex-500 to-purple-600 flex items-center justify-center text-white font-bold text-4xl shadow-inner">
                      {initials}
                    </div>
                  )}
                </div>
              </div>

              <h3 className="text-2xl font-bold text-white mb-2 tracking-tight">{displayName}</h3>
              <p className="text-sm text-zinc-400 mb-8">
                {callState === 'calling' && t('calling')}
                {callState === 'incoming' && (callType === 'video' ? t('incomingVideoCall') : t('incomingCall'))}
                {callState === 'connected' && formatDuration(duration)}
                {callState === 'ended' && t('callEnded')}
              </p>

              {/* Local video preview (during calling with camera) */}
              {hasLocalVideo && callState === 'calling' && (
                <div className="mb-6 rounded-2xl overflow-hidden bg-zinc-900 w-48">
                  <video
                    ref={localVideoRef}
                    autoPlay
                    playsInline
                    muted
                    className="w-full h-auto"
                  />
                </div>
              )}

              {/* Hidden remote video element */}
              <video ref={remoteVideoRef} autoPlay playsInline muted className="hidden" />
            </div>
          )}

          {/* === Controls === */}
          <div className="px-8 pb-10 flex items-center justify-center gap-4 relative z-10 flex-wrap">
            {callState === 'incoming' && (
              <>
                <button
                  onClick={declineCall}
                  className="w-16 h-16 rounded-full bg-red-500 hover:bg-red-600 flex items-center justify-center text-white shadow-xl shadow-red-500/30 transition-all hover:scale-105"
                >
                  <PhoneOff size={24} />
                </button>
                <div className="w-8" />
                <button
                  onClick={acceptCall}
                  className="w-16 h-16 rounded-full bg-emerald-500 hover:bg-emerald-600 flex items-center justify-center text-white shadow-xl shadow-emerald-500/30 transition-all hover:scale-105 animate-pulse"
                >
                  {callType === 'video' ? <Video size={24} /> : <Phone size={24} className="animate-bounce" />}
                </button>
              </>
            )}

            {callState === 'connected' && (
              <>
                {/* Mic button with dropdown */}
                <div className="relative">
                  <button
                    onClick={toggleMic}
                    className={`w-11 h-11 rounded-full flex items-center justify-center transition-colors ${isMuted ? 'bg-red-500/20 text-red-400' : 'bg-white/10 text-white hover:bg-white/20'
                      }`}
                    title={isMuted ? t('unmute') : t('mute')}
                  >
                    {isMuted ? <MicOff size={18} /> : <Mic size={18} />}
                  </button>
                  <button
                    onClick={async (e) => { e.stopPropagation(); await refreshMicrophones(); setShowMicMenu(!showMicMenu); setShowCameraMenu(false); setShowVolumeSlider(false); }}
                    className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-zinc-700 hover:bg-zinc-600 flex items-center justify-center text-white/70 hover:text-white transition-colors border border-zinc-600"
                  >
                    <ChevronUp size={10} />
                  </button>
                  {/* PTT indicator */}
                  {pushToTalkEnabled && (
                    <div className="absolute -bottom-5 left-1/2 -translate-x-1/2 whitespace-nowrap">
                      <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${pttActive ? 'bg-emerald-500/30 text-emerald-400' : 'bg-white/10 text-zinc-500'}`}>
                        {pttActive ? 'PTT' : pushToTalkKey}
                      </span>
                    </div>
                  )}
                </div>
                {/* Camera toggle — only for video calls */}
                {initialCallType === 'video' && (
                  <button
                    onClick={toggleVideo}
                    className={`w-11 h-11 rounded-full flex items-center justify-center transition-colors ${isVideoOff ? 'bg-red-500/20 text-red-400' : 'bg-white/10 text-white hover:bg-white/20'
                      }`}
                  >
                    {isVideoOff ? <VideoOff size={18} /> : <Video size={18} />}
                  </button>
                )}
                {/* Camera selector — only for video calls */}
                {initialCallType === 'video' && (
                  <button
                    onClick={openCameraMenu}
                    className="w-11 h-11 rounded-full flex items-center justify-center transition-colors bg-white/10 text-white hover:bg-white/20"
                    title={t('switchCamera')}
                  >
                    <SwitchCamera size={18} />
                  </button>
                )}
                <button
                  onClick={toggleScreenShare}
                  className={`w-11 h-11 rounded-full flex items-center justify-center transition-colors ${isScreenSharing ? 'bg-vortex-500/30 text-vortex-400' : 'bg-white/10 text-white hover:bg-white/20'
                    }`}
                  title={isScreenSharing ? t('stopScreenShare') : t('screenShare')}
                >
                  {isScreenSharing ? <MonitorOff size={18} /> : <Monitor size={18} />}
                </button>
                {/* Speaker selector */}
                <div className="relative">
                  <button
                    onClick={async (e) => {
                      e.stopPropagation();
                      await refreshSpeakers();
                      setShowSpeakerMenu(!showSpeakerMenu);
                      setShowVolumeSlider(false);
                      setShowMicMenu(false);
                    }}
                    className="w-11 h-11 rounded-full flex items-center justify-center transition-colors bg-white/10 text-white hover:bg-white/20"
                    title="Наушники / динамик"
                  >
                    <Volume2 size={18} />
                  </button>
                  {/* Speaker selector popup */}
                  {showSpeakerMenu && speakers.length > 0 && (
                    <>
                      <div className="fixed inset-0 z-[200]" onClick={() => setShowSpeakerMenu(false)} />
                      <div className="fixed z-[201] left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[300px] rounded-xl bg-zinc-800/95 backdrop-blur-md border border-zinc-600 shadow-2xl py-2">
                        <div className="px-3 py-1.5 text-xs text-zinc-400 uppercase tracking-wider border-b border-zinc-700 mb-1">Наушники / Динамик</div>
                        {speakers.map((spk, i) => (
                          <button
                            key={spk.deviceId}
                            onClick={() => switchSpeaker(spk.deviceId)}
                            className={`w-full text-left px-4 py-2.5 text-sm transition-colors ${activeSpeakerId === spk.deviceId
                                ? 'text-vortex-400 bg-vortex-500/20 font-medium'
                                : 'text-zinc-200 hover:bg-zinc-700'
                              }`}
                          >
                            {spk.label || `Динамик ${i + 1}`}
                          </button>
                        ))}
                      </div>
                    </>
                  )}
                </div>
                {/* Noise suppression */}
                <button
                  onClick={toggleNoiseSuppression}
                  className={`w-11 h-11 rounded-full flex items-center justify-center transition-colors ${noiseSuppression ? 'bg-emerald-500/20 text-emerald-400' : 'bg-white/10 text-white hover:bg-white/20'
                    }`}
                  title={noiseSuppression ? t('noiseSuppressionOn') : t('noiseSuppressionOff')}
                >
                  {noiseSuppression ? <ShieldCheck size={18} /> : <ShieldOff size={18} />}
                </button>
                <button
                  onClick={endCallSafe}
                  className="w-14 h-14 rounded-full bg-red-500 hover:bg-red-600 flex items-center justify-center text-white shadow-xl shadow-red-500/30 transition-all hover:scale-105 ml-2"
                >
                  <PhoneOff size={22} />
                </button>
              </>
            )}

            {callState === 'calling' && (
              <button
                onClick={endCallSafe}
                className="w-16 h-16 rounded-full bg-red-500 hover:bg-red-600 flex items-center justify-center text-white shadow-xl shadow-red-500/30 transition-all hover:scale-105"
              >
                <PhoneOff size={24} />
              </button>
            )}

            {callState === 'ended' && (
              <p className="text-sm text-zinc-500">{t('callEnded')}</p>
            )}
          </div>
        </div>
      </div>
      )}

      {/* Screen source picker for Electron */}
      <ScreenSourcePicker
        isOpen={showScreenSourcePicker}
        onClose={() => setShowScreenSourcePicker(false)}
        onSelect={handleScreenSourceSelect}
      />
    </>
  );
}
