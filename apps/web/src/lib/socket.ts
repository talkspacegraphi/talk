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
  const socketUrl = import.meta.env.DEV && !isElectron
    ? window.location.origin
    : 'http://localhost:3001';

  socket = io(socketUrl, {
    auth: { token },
    transports: ['websocket', 'polling'],
    reconnectionAttempts: 10,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000,
    timeout: 10000,
  });

  socket.on('connect', () => {
    if (import.meta.env.DEV) console.log('[Socket] connected');
  });

  socket.on('disconnect', (reason) => {
    if (import.meta.env.DEV) console.log('[Socket] disconnected:', reason);
  });

  socket.on('connect_error', (err) => {
    if (import.meta.env.DEV) console.error('[Socket] connection error:', err.message);
  });

  return socket;
}

export function getSocket(): Socket | null {
  return socket;
}

export function disconnectSocket() {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
}
