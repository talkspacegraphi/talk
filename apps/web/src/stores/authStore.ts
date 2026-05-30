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
      const { token, user } = await api.login(username, password);
      localStorage.setItem('vortex_token', token);
      api.setToken(token);
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
      const { token, user } = await api.register(username, displayName, password, bio);
      localStorage.setItem('vortex_token', token);
      api.setToken(token);
      connectSocket(token);
      set({ token, user, isLoading: false });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      set({ error: msg, isLoading: false });
      throw err;
    }
  },

  logout: () => {
    localStorage.removeItem('vortex_token');
    api.setToken(null);
    disconnectSocket();
    set({ token: null, user: null });
  },

  checkAuth: async () => {
    const token = get().token;
    if (!token) {
      set({ isLoading: false });
      return;
    }

    // Retry up to 3 times in case server is still starting
    let lastError: unknown;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        api.setToken(token);
        const { user } = await api.getMe();
        connectSocket(token);
        set({ user, isLoading: false });
        return;
      } catch (err) {
        lastError = err;
        // Only retry on network/server errors, not on auth errors (401/403)
        const msg = err instanceof Error ? err.message : '';
        if (msg.includes('Требуется авторизация') || msg.includes('Недействительный токен')) {
          break;
        }
        if (attempt < 2) {
          await new Promise(r => setTimeout(r, 1000 * (attempt + 1)));
        }
      }
    }
    console.warn('checkAuth failed:', lastError);
    localStorage.removeItem('vortex_token');
    set({ token: null, user: null, isLoading: false });
  },

  updateUser: (data) => {
    const { user } = get();
    if (user) {
      set({ user: { ...user, ...data } });
    }
  },
}));
