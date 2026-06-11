import { io, Socket } from 'socket.io-client';

let socket: Socket | null = null;

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
    transports: ['websocket', 'polling'],
    reconnectionAttempts: 100,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 10000,
    timeout: 20000,
    upgrade: true,
    rememberUpgrade: true,
  });

  socket.on('connect', () => {
    if (import.meta.env.DEV) console.log('[Socket] connected');
  });

  socket.on('disconnect', (reason) => {
    if (import.meta.env.DEV) console.log('[Socket] disconnected:', reason);
  });

  socket.on('connect_error', (err) => {
    if (import.meta.env.DEV) console.warn('[Socket] connection error:', err.message);
    // If websocket fails, force polling fallback
    if (socket && socket.io?.opts?.transports?.[0] === 'websocket') {
      socket.io.opts.transports = ['polling'];
    }
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
