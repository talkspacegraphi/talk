import type { User as UserType, UserPresence, FriendRequest, FriendWithId } from '../../lib/types';
import type { ChatTheme } from '../../stores/themeStore';

export type SideView = 'main' | 'profile' | 'settings' | 'about' | 'themes' | 'friends' | 'audio';

export interface SideMenuContext {
  user: UserType | null;
  updateUser: (data: Partial<UserType>) => void;
  t: (key: string) => string;
  lang: string;
  setLang: (lang: 'ru' | 'en') => void;
  changeView: (view: SideView) => void;
  onClose: () => void;
  handleLogout: () => void;
}

export interface ThemeCard {
  id: ChatTheme;
  color: string;
  accent: string;
  name: string;
  nameEn: string;
  desc: string;
  descEn: string;
  animated?: boolean;
  gradient?: string;
}

export const themeCards: ThemeCard[] = [
  { id: 'midnight', color: '#0f0f13', accent: '#6366f1', name: 'Полночь', nameEn: 'Midnight', desc: 'Тёмная тема с мягкими акцентами', descEn: 'Dark theme with soft accents' },
  { id: 'ocean', color: '#0b172a', accent: '#3b82f6', name: 'Океан', nameEn: 'Ocean', desc: 'Глубокий синий с прохладными тонами', descEn: 'Deep blue with cool tones' },
  { id: 'forest', color: '#0f1c15', accent: '#10b981', name: 'Лес', nameEn: 'Forest', desc: 'Природный зелёный и спокойствие', descEn: 'Natural green and serenity' },
  { id: 'sunset', color: '#1f111a', accent: '#ec4899', gradient: 'linear-gradient(135deg, #1f111a, #150a0f)', name: 'Закат', nameEn: 'Sunset', desc: 'Тёплый розовый градиент заката', descEn: 'Warm pink sunset gradient' },
  { id: 'classic', color: '#121215', accent: '#a1a1aa', name: 'Классика', nameEn: 'Classic', desc: 'Минималистичная монохромная тема', descEn: 'Minimalist monochrome theme' },
  { id: 'neon', color: '#0b0f19', accent: '#8b5cf6', name: 'Неон', nameEn: 'Neon', desc: 'Фиолетовое свечение за курсором', descEn: 'Purple glow follows your cursor', animated: true },
  { id: 'aurora', color: '#022c22', accent: '#10b981', gradient: 'linear-gradient(135deg, #022c22, #064e3b)', name: 'Аврора', nameEn: 'Aurora', desc: 'Северное сияние реагирует на мышь', descEn: 'Northern lights react to mouse', animated: true },
  { id: 'cyber', color: '#000000', accent: '#f59e0b', name: 'Кибер', nameEn: 'Cyber', desc: 'Сетка и янтарное свечение мыши', descEn: 'Grid pattern with amber glow', animated: true },
  { id: 'glass', color: '#0d1117', accent: '#3b82f6', name: 'Стекло', nameEn: 'Glass', desc: 'Плавное свечение следует за мышью', descEn: 'Smooth glow follows the cursor', animated: true },
  { id: 'void', color: '#000000', accent: '#ffffff', name: 'Бездна', nameEn: 'Void', desc: 'Абсолютный мрак с точечным светом', descEn: 'Absolute darkness with spot light', animated: true },
];
