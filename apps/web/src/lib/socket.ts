import { io, Socket } from 'socket.io-client';

let socket: Socket | null = null;
let _connectionListeners: Array<(status: ConnectionStatus) => void> = [];
export type ConnectionStatus = 'connected' | 'connecting' | 'reconnecting' | 'disconnected' | 'offline';
let _currentStatus: ConnectionStatus = 'disconnected';

function _emitStatus(status: ConnectionStatus) {
  _currentStatus = status;
  _connectionListeners.forEach(fn => fn(status));
}

export function onConnectionStatusChange(fn: (status: ConnectionStatus) => void): () => void {
  _connectionListeners.push(fn);
  return () => { _connectionListeners = _connectionListeners.filter(l => l !== fn); };
}

export function getConnectionStatus(): ConnectionStatus {
  if (!navigator.onLine) return 'offline';
  return _currentStatus;
}

export function connectSocket(token: string): Socket {
  if (socket?.connected) {
    return socket;
  }

  if (socket) {
    socket.removeAllListeners();
    socket.disconnect();
    socket = null;
  }

  const isElectron = typeof window !== 'undefined' && !!(window as any).electronAPI;
  const isDev = import.meta.env.DEV;
  const isLocalServer = isElectron && !window.location.protocol.startsWith('http') || window.location.origin === 'http://localhost:3001';
  const socketUrl = isDev && !isElectron
    ? window.location.origin
    : isElectron && window.location.origin.includes('localhost')
      ? 'http://localhost:3001'
      : window.location.origin;

  socket = io(socketUrl, {
    auth: { token },
    transports: ['websocket'],
    reconnectionAttempts: Infinity,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 10000,
    timeout: 20000,
    upgrade: true,
    rememberUpgrade: true,
  });

  socket.on('connect', () => {
    _emitStatus('connected');
    if (import.meta.env.DEV) console.log('[Socket] connected');
    window.dispatchEvent(new Event('vortex:socket-connected'));
  });

  socket.on('disconnect', (reason) => {
    _emitStatus('disconnected');
    if (import.meta.env.DEV) console.log('[Socket] disconnected:', reason);
  });

  socket.io.on('reconnect_attempt', (attempt) => {
    _emitStatus('reconnecting');
    if (import.meta.env.DEV) console.log('[Socket] reconnect attempt', attempt);
  });

  socket.io.on('reconnect', () => {
    _emitStatus('connected');
    window.dispatchEvent(new Event('vortex:socket-reconnected'));
  });

  socket.on('connect_error', (err) => {
    if (!navigator.onLine) {
      _emitStatus('offline');
    } else if (_currentStatus !== 'reconnecting') {
      _emitStatus('connecting');
    }
    if (import.meta.env.DEV) console.warn('[Socket] connection error:', err.message);
  });

  return socket;
}

export function getSocket(): Socket | null {
  return socket;
}

export function disconnectSocket() {
  if (socket) {
    socket.removeAllListeners();
    socket.disconnect();
    socket = null;
  }
}
