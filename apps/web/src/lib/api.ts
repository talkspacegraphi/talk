import type { User, UserBasic, UserPresence, Chat, Message, MediaItem, StoryGroup, FriendRequest, FriendWithId, FriendshipStatus } from './types';

const isElectron = typeof window !== 'undefined' && !!(window as any).electronAPI;
const API_BASE = import.meta.env.DEV && !isElectron
  ? '/api'
  : `${window.location.origin}/api`;

class ApiClient {
  private token: string | null = null;
  private refreshToken: string | null = null;
  private isRefreshing = false;
  private refreshPromise: Promise<string> | null = null;

  setToken(token: string | null) {
    this.token = token;
  }

  setRefreshToken(refreshToken: string | null) {
    this.refreshToken = refreshToken;
  }

  private async refreshAccessToken(): Promise<string> {
    if (!this.refreshToken) throw new Error('No refresh token');

    const response = await fetch(`${API_BASE}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken: this.refreshToken }),
    });

    if (!response.ok) {
      this.refreshToken = null;
      throw new Error('Refresh failed');
    }

    const data = await response.json();
    this.token = data.token;
    this.refreshToken = data.refreshToken;

    localStorage.setItem('vortex_token', data.token);
    localStorage.setItem('vortex_refresh_token', data.refreshToken);

    return data.token;
  }

  private async request<T>(endpoint: string, options: RequestInit & { timeout?: number; _retry?: boolean } = {}): Promise<T> {
    const { timeout = 30_000, _retry, ...fetchOptions } = options;
    const controller = new AbortController();
    const timer = timeout > 0 ? setTimeout(() => controller.abort(), timeout) : undefined;

    const headers: HeadersInit = {
      'Content-Type': 'application/json',
      ...(this.token ? { Authorization: `Bearer ${this.token}` } : {}),
      ...fetchOptions.headers,
    };

    let response: Response;
    try {
      response = await fetch(`${API_BASE}${endpoint}`, {
        ...fetchOptions,
        headers,
        signal: controller.signal,
      });
    } catch (err) {
      clearTimeout(timer);
      if (err instanceof DOMException && err.name === 'AbortError') {
        throw new Error('Время ожидания запроса истекло');
      }
      throw err;
    }
    clearTimeout(timer);

    // If 401 (или «недействительный токен» пришёл с 403 от старого middleware),
    // пробуем обновить access-токен через refresh-токен.
    const shouldTryRefresh = !_retry && this.refreshToken && (
      response.status === 401 ||
      response.status === 403
    );
    if (shouldTryRefresh) {
      // Сначала прочитаем тело ответа, чтобы понять — стоит ли рефрешить
      const errBody = await response.clone().json().catch(() => ({} as { error?: string }));
      const errMsg = (errBody?.error || '').toString();
      const canRecover = response.status === 401
        || /Недействительный токен|Token has been revoked|Сессия истекла|Invalid token/i.test(errMsg);
      if (canRecover) {
        try {
          if (!this.isRefreshing) {
            this.isRefreshing = true;
            this.refreshPromise = this.refreshAccessToken();
          }
          await this.refreshPromise;
          return this.request<T>(endpoint, { ...options, _retry: true });
        } catch {
          throw new Error('Сессия истекла. Войдите снова.');
        } finally {
          this.isRefreshing = false;
          this.refreshPromise = null;
        }
      }
    }

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Ошибка сервера' }));
      throw new Error(error.error || 'Ошибка запроса');
    }

    return response.json();
  }

  // ─── Auth ─────────────────────────────────────────────────────────

  async login(username: string, password: string) {
    return this.request<{ token: string; refreshToken: string; user: User }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    });
  }

  async register(username: string, displayName: string, password: string, bio?: string) {
    return this.request<{ token: string; refreshToken: string; user: User }>('/auth/register', {
      method: 'POST',
      body: JSON.stringify({ username, displayName, password, bio }),
    });
  }

  async logout() {
    try {
      await this.request('/auth/logout', { method: 'POST' });
    } catch {
      // Ignore logout errors
    }
  }

  async getMe() {
    return this.request<{ user: User }>('/auth/me');
  }

  // ─── Users ────────────────────────────────────────────────────────

  async searchUsers(query: string) {
    return this.request<UserPresence[]>(`/users/search?q=${encodeURIComponent(query)}`);
  }

  async getUser(id: string) {
    return this.request<User>(`/users/${id}`);
  }

  async updateProfile(data: { displayName?: string; bio?: string; birthday?: string }) {
    return this.request<User>('/users/profile', {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  async uploadAvatar(file: File) {
    const formData = new FormData();
    formData.append('avatar', file);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 120_000);
    const response = await fetch(`${API_BASE}/users/avatar`, {
      method: 'POST',
      headers: {
        ...(this.token ? { Authorization: `Bearer ${this.token}` } : {}),
      },
      body: formData,
      signal: controller.signal,
    });
    clearTimeout(timer);

    if (!response.ok) throw new Error('Ошибка загрузки аватара');
    return response.json() as Promise<User>;
  }

  async removeAvatar() {
    return this.request<User>('/users/avatar', { method: 'DELETE' });
  }

  async uploadBanner(file: File) {
    const formData = new FormData();
    formData.append('banner', file);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 120_000);
    const response = await fetch(`${API_BASE}/users/banner`, {
      method: 'POST',
      headers: {
        ...(this.token ? { Authorization: `Bearer ${this.token}` } : {}),
      },
      body: formData,
      signal: controller.signal,
    });
    clearTimeout(timer);

    if (!response.ok) throw new Error('Ошибка загрузки баннера');
    return response.json() as Promise<User>;
  }

  async setBannerColor(color: string) {
    return this.request<User>('/users/banner/color', {
      method: 'POST',
      body: JSON.stringify({ color }),
    });
  }

  async removeBanner() {
    return this.request<User>('/users/banner', { method: 'DELETE' });
  }

  async setAvatarDecoration(decoration: string) {
    return this.request<User>('/users/avatar/decoration', {
      method: 'POST',
      body: JSON.stringify({ decoration }),
    });
  }

  async searchMessages(query: string, chatId?: string) {
    const params = new URLSearchParams({ q: query });
    if (chatId) params.append('chatId', chatId);
    return this.request<Message[]>(`/users/messages/search?${params}`);
  }

  // ─── Chats ────────────────────────────────────────────────────────

  async getChats() {
    return this.request<Chat[]>('/chats');
  }

  async createPersonalChat(userId: string) {
    return this.request<Chat>('/chats/personal', {
      method: 'POST',
      body: JSON.stringify({ userId }),
    });
  }

  async createGroupChat(name: string, memberIds: string[]) {
    return this.request<Chat>('/chats/group', {
      method: 'POST',
      body: JSON.stringify({ name, memberIds }),
    });
  }

  // ─── Messages ─────────────────────────────────────────────────────

  async getMessages(chatId: string, cursor?: string, limit = 50) {
    const params = new URLSearchParams();
    if (cursor) params.set('cursor', cursor);
    if (limit) params.set('limit', String(limit));
    const qs = params.toString();
    return this.request<Message[]>(`/messages/chat/${chatId}${qs ? '?' + qs : ''}`);
  }

  async markMessagesRead(chatId: string, messageIds: string[]) {
    return this.request<{ ok: boolean }>('/messages/read', {
      method: 'POST',
      body: JSON.stringify({ chatId, messageIds }),
    });
  }

  async uploadFile(file: File) {
    const formData = new FormData();
    formData.append('file', file);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 120_000);
    const response = await fetch(`${API_BASE}/messages/upload`, {
      method: 'POST',
      headers: {
        ...(this.token ? { Authorization: `Bearer ${this.token}` } : {}),
      },
      body: formData,
      signal: controller.signal,
    });
    clearTimeout(timer);

    if (!response.ok) throw new Error('Ошибка загрузки файла');
    return response.json() as Promise<{ url: string; filename: string; size: number }>;
  }

  // ─── Groups ───────────────────────────────────────────────────────

  async updateGroup(chatId: string, data: { name?: string }) {
    return this.request<Chat>(`/chats/${chatId}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  async uploadGroupAvatar(chatId: string, file: File) {
    const formData = new FormData();
    formData.append('avatar', file);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 120_000);
    const response = await fetch(`${API_BASE}/chats/${chatId}/avatar`, {
      method: 'POST',
      headers: {
        ...(this.token ? { Authorization: `Bearer ${this.token}` } : {}),
      },
      body: formData,
      signal: controller.signal,
    });
    clearTimeout(timer);

    if (!response.ok) throw new Error('Ошибка загрузки аватара');
    return response.json() as Promise<Chat>;
  }

  async removeGroupAvatar(chatId: string) {
    return this.request<Chat>(`/chats/${chatId}/avatar`, { method: 'DELETE' });
  }

  async addGroupMembers(chatId: string, userIds: string[]) {
    return this.request<Chat>(`/chats/${chatId}/members`, {
      method: 'POST',
      body: JSON.stringify({ userIds }),
    });
  }

  async removeGroupMember(chatId: string, userId: string) {
    return this.request<Chat>(`/chats/${chatId}/members/${userId}`, { method: 'DELETE' });
  }

  async clearChat(chatId: string) {
    return this.request<{ message: string }>(`/chats/${chatId}/clear`, { method: 'POST' });
  }

  async deleteChat(chatId: string) {
    return this.request<{ message: string }>(`/chats/${chatId}`, { method: 'DELETE' });
  }

  async togglePinChat(chatId: string) {
    return this.request<{ isPinned: boolean }>(`/chats/${chatId}/pin`, { method: 'POST' });
  }

  async toggleMuteChat(chatId: string) {
    return this.request<{ isMuted: boolean }>(`/chats/${chatId}/mute`, { method: 'PATCH' });
  }

  async getSharedMedia(chatId: string, type: 'media' | 'files' | 'links') {
    return this.request<Message[]>(`/messages/chat/${chatId}/shared?type=${type}`);
  }

  // ─── ICE servers ──────────────────────────────────────────────────

  async getIceServers() {
    return this.request<{ iceServers: RTCIceServer[] }>('/ice-servers');
  }

  // ─── Stories ──────────────────────────────────────────────────────

  async getStories() {
    return this.request<StoryGroup[]>('/stories');
  }

  async createStory(data: { type: string; mediaUrl?: string; content?: string; bgColor?: string }) {
    return this.request<{ id: string }>('/stories', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async viewStory(storyId: string) {
    return this.request<{ message: string }>(`/stories/${storyId}/view`, { method: 'POST' });
  }

  async deleteStory(storyId: string) {
    return this.request<{ message: string }>(`/stories/${storyId}`, { method: 'DELETE' });
  }

  async getStoryViewers(storyId: string) {
    return this.request<Array<{ userId: string; username: string; displayName: string; avatar: string | null; viewedAt: string }>>(`/stories/${storyId}/viewers`);
  }

  // ─── Favorites ────────────────────────────────────────────────────

  async getOrCreateFavorites() {
    return this.request<Chat>('/chats/favorites', { method: 'POST' });
  }

  // ─── Settings ─────────────────────────────────────────────────────

  async updateSettings(data: { hideStoryViews?: boolean }) {
    return this.request<User>('/users/settings', {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  // ─── Friends ──────────────────────────────────────────────────────

  async getFriends() {
    return this.request<FriendWithId[]>('/friends');
  }

  async getFriendRequests() {
    return this.request<FriendRequest[]>('/friends/requests');
  }

  async getOutgoingRequests() {
    return this.request<FriendRequest[]>('/friends/outgoing');
  }

  async getFriendshipStatus(userId: string) {
    return this.request<FriendshipStatus>(`/friends/status/${userId}`);
  }

  async sendFriendRequest(friendId: string) {
    return this.request<{ status: string }>('/friends/request', {
      method: 'POST',
      body: JSON.stringify({ friendId }),
    });
  }

  async acceptFriendRequest(friendshipId: string) {
    return this.request<{ id: string }>(`/friends/${friendshipId}/accept`, { method: 'POST' });
  }

  async declineFriendRequest(friendshipId: string) {
    return this.request<{ success: boolean }>(`/friends/${friendshipId}/decline`, { method: 'POST' });
  }

  async removeFriend(friendshipId: string) {
    return this.request<{ success: boolean }>(`/friends/${friendshipId}`, { method: 'DELETE' });
  }

  // ─── Block/Unblock ────────────────────────────────────────────────

  async blockUser(userId: string) {
    return this.request<{ success: boolean }>('/users/block', {
      method: 'POST',
      body: JSON.stringify({ userId }),
    });
  }

  async unblockUser(userId: string) {
    return this.request<{ success: boolean }>('/users/unblock', {
      method: 'POST',
      body: JSON.stringify({ userId }),
    });
  }

  async getBlockedUsers() {
    return this.request<Array<{ id: string; username: string; displayName: string; avatar: string | null }>>('/users/blocked');
  }

  async isUserBlocked(userId: string) {
    return this.request<{ blocked: boolean }>(`/users/blocked/${userId}`);
  }

  // ─── Link previews ───────────────────────────────────────────────

  async getLinkPreview(url: string) {
    return this.request<{
      url: string;
      type: 'youtube' | 'twitter' | 'instagram' | 'generic';
      title?: string;
      description?: string;
      image?: string;
      siteName?: string;
      youtubeId?: string;
    }>('/links/preview', {
      method: 'POST',
      body: JSON.stringify({ url }),
    });
  }

  async getUserLinks(userId: string) {
    return this.request<Array<{
      id: string;
      chatId: string;
      userId: string;
      url: string;
      title?: string;
      description?: string;
      image?: string;
      createdAt: string;
    }>>(`/users/${userId}/links`);
  }
}

export const api = new ApiClient();
