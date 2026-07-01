import { create } from 'zustand';
import { api } from '../lib/api';
import { connectSocket, disconnectSocket } from '../lib/socket';
import type { User } from '../lib/types';

interface AuthState {
  token: string | null;
  user: User | null;
  isLoading: boolean;
  error: string | null;
  login: (username: string, password: string) => Promise<void>;
  register: (username: string, displayName: string, password: string, bio?: string) => Promise<void>;
  logout: () => void;
  checkAuth: () => Promise<void>;
  updateUser: (data: Partial<User>) => void;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  token: localStorage.getItem('vortex_token'),
  user: null,
  isLoading: true,
  error: null,

  login: async (username, password) => {
    try {
      set({ error: null, isLoading: true });
      const { token, refreshToken, user } = await api.login(username, password);
      localStorage.setItem('vortex_token', token);
      localStorage.setItem('vortex_refresh_token', refreshToken);
      api.setToken(token);
      api.setRefreshToken(refreshToken);
      connectSocket(token);
      set({ token, user, isLoading: false });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      set({ error: msg, isLoading: false });
      throw err;
    }
  },

  register: async (username, displayName, password, bio) => {
    try {
      set({ error: null, isLoading: true });
      const { token, refreshToken, user } = await api.register(username, displayName, password, bio);
      localStorage.setItem('vortex_token', token);
      localStorage.setItem('vortex_refresh_token', refreshToken);
      api.setToken(token);
      api.setRefreshToken(refreshToken);
      connectSocket(token);
      set({ token, user, isLoading: false });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      set({ error: msg, isLoading: false });
      throw err;
    }
  },

  logout: () => {
    const token = get().token;
    if (token) {
      // Notify server to blacklist token (fire and forget)
      api.logout().catch(() => {});
    }
    localStorage.removeItem('vortex_token');
    localStorage.removeItem('vortex_refresh_token');
    api.setToken(null);
    api.setRefreshToken(null);
    disconnectSocket();
    set({ token: null, user: null });
  },

  checkAuth: async () => {
    const token = get().token;
    const refreshToken = localStorage.getItem('vortex_refresh_token');

    if (!token) {
      set({ isLoading: false });
      return;
    }

    api.setToken(token);
    if (refreshToken) {
      api.setRefreshToken(refreshToken);
    }

    // Retry up to 8 times in case server is still starting (Render free tier cold start: 30-50s)
    let lastError: unknown;
    for (let attempt = 0; attempt < 8; attempt++) {
      try {
        const { user } = await api.getMe();
        connectSocket(token);
        set({ user, isLoading: false });
        return;
      } catch (err) {
        lastError = err;
        const msg = err instanceof Error ? err.message : '';
        // If session expired or token revoked, try refresh
        if (msg.includes('Сессия истекла') || msg.includes('Token has been revoked') || msg.includes('Недействительный токен')) {
          // If refresh token exists, try to refresh
          if (refreshToken) {
            try {
              api.setRefreshToken(refreshToken);
              // The request interceptor will handle the refresh automatically
              const { user } = await api.getMe();
              connectSocket(api['token'] || token);
              set({ token: api['token'] || token, user, isLoading: false });
              return;
            } catch {
              // Refresh failed
            }
          }
          break;
        }
        // If network error (offline), let user in with token but no user data
        if (!navigator.onLine || msg.includes('NetworkError') || msg.includes('Failed to fetch') || msg.includes('ERR_NETWORK')) {
          console.warn('Offline mode: letting user in with cached token');
          connectSocket(token);
          set({ token, isLoading: false });
          // Try to load user data later when online
          window.addEventListener('online', () => {
            api.getMe().then(({ user }) => {
              set({ user });
              connectSocket(token);
            }).catch(() => {});
          }, { once: true });
          return;
        }
        if (attempt < 7) {
          await new Promise(r => setTimeout(r, Math.min(1000 * (attempt + 1), 10000)));
        }
      }
    }
    console.warn('checkAuth failed:', lastError);
    // Don't clear token on network errors — let user retry manually
    const isNetworkError = !navigator.onLine || String(lastError).includes('NetworkError') || String(lastError).includes('Failed to fetch') || String(lastError).includes('ERR_NETWORK');
    if (!isNetworkError) {
      localStorage.removeItem('vortex_token');
      localStorage.removeItem('vortex_refresh_token');
      api.setToken(null);
      api.setRefreshToken(null);
      set({ token: null, user: null, isLoading: false });
    } else {
      set({ isLoading: false });
    }
  },

  updateUser: (data) => {
    const { user } = get();
    if (user) {
      set({ user: { ...user, ...data } });
    }
  },
}));
