import type { User, UserBasic, UserPresence, Chat, Message, MediaItem, StoryGroup, FriendRequest, FriendWithId, FriendshipStatus } from './types';

// В Electron загружаем с Vite dev server (5173), но прокси не работает
// Поэтому используем прямое подключение к бэкенду
const isElectron = typeof window !== 'undefined' && !!(window as any).electronAPI;
const API_BASE = import.meta.env.DEV && !isElectron
  ? '/api'  // В браузере через Vite - используем прокси
  : 'http://localhost:3001/api';  // В Electron или продакшене - напрямую на бэкенд

console.log('API_BASE:', API_BASE, 'isElectron:', isElectron, 'isDev:', import.meta.env.DEV);

class ApiClient {
  private token: string | null = null;

  setToken(token: string | null) {
    this.token = token;
  }

  private async request<T>(endpoint: string, options: RequestInit & { timeout?: number } = {}): Promise<T> {
    const { timeout = 30_000, ...fetchOptions } = options;
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

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: '\u041e\u0448\u0438\u0431\u043a\u0430 \u0441\u0435\u0440\u0432\u0435\u0440\u0430' }));
      throw new Error(error.error || '\u041e\u0448\u0438\u0431\u043a\u0430 \u0437\u0430\u043f\u0440\u043e\u0441\u0430');
    }

    return response.json();
  }

  // \u0410\u0432\u0442\u043e\u0440\u0438\u0437\u0430\u0446\u0438\u044f
  async login(username: string, password: string) {
    return this.request<{ token: string; user: User }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    });
  }

  async register(username: string, displayName: string, password: string, bio?: string) {
    return this.request<{ token: string; user: User }>('/auth/register', {
      method: 'POST',
      body: JSON.stringify({ username, displayName, password, bio }),
    });
  }

  async getMe() {
    return this.request<{ user: User }>('/auth/me');
  }

  // \u041f\u043e\u043b\u044c\u0437\u043e\u0432\u0430\u0442\u0435\u043b\u0438
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

  // \u0427\u0430\u0442\u044b
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

  // \u0421\u043e\u043e\u0431\u0449\u0435\u043d\u0438\u044f
  async getMessages(chatId: string, cursor?: string) {
    const params = cursor ? `?cursor=${cursor}` : '';
    return this.request<Message[]>(`/messages/chat/${chatId}${params}`);
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

    if (!response.ok) throw new Error('\u041e\u0448\u0438\u0431\u043a\u0430 \u0437\u0430\u0433\u0440\u0443\u0437\u043a\u0438 \u0444\u0430\u0439\u043b\u0430');
    return response.json() as Promise<{ url: string; filename: string; size: number }>;
  }

  // \u0413\u0440\u0443\u043f\u043f\u044b
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

    if (!response.ok) throw new Error('\u041e\u0448\u0438\u0431\u043a\u0430 \u0437\u0430\u0433\u0440\u0443\u0437\u043a\u0438 \u0430\u0432\u0430\u0442\u0430\u0440\u0430');
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
    return this.request<Chat>(`/chats/${chatId}/members/${userId}`, {
      method: 'DELETE',
    });
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

  // ICE серверы для WebRTC
  async getIceServers() {
    return this.request<{ iceServers: RTCIceServer[] }>('/ice-servers');
  }

  // Stories
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

  // Favorites chat
  async getOrCreateFavorites() {
    return this.request<Chat>('/chats/favorites', { method: 'POST' });
  }

  // User settings
  async updateSettings(data: { hideStoryViews?: boolean }) {
    return this.request<User>('/users/settings', {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  // Friends
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

  // Block/Unblock users
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

  // Link previews
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

  // Get shared links with user
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
