import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type ChatTheme = 'midnight' | 'ocean' | 'forest' | 'sunset' | 'classic' | 'neon' | 'aurora' | 'cyber' | 'glass' | 'void';
export type AppFont = 'default' | 'rounded' | 'mono' | 'serif';

interface ChatBackground {
    url: string;
    blur: number; // 0-20
}

interface ThemeState {
    chatTheme: ChatTheme;
    appFont: AppFont;
    chatBackgrounds: Record<string, ChatBackground>; // chatId -> background
    setChatTheme: (theme: ChatTheme) => void;
    setAppFont: (font: AppFont) => void;
    setChatBackground: (chatId: string, background: ChatBackground | null) => void;
    getChatBackground: (chatId: string) => ChatBackground | null;
}

export const useThemeStore = create<ThemeState>()(
    persist(
        (set, get) => ({
            chatTheme: 'midnight',
            appFont: 'default',
            chatBackgrounds: {},
            setChatTheme: (theme) => set({ chatTheme: theme }),
            setAppFont: (font) => set({ appFont: font }),
            setChatBackground: (chatId, background) => set((state) => {
                const newBackgrounds = { ...state.chatBackgrounds };
                if (background === null) {
                    delete newBackgrounds[chatId];
                } else {
                    newBackgrounds[chatId] = background;
                }
                return { chatBackgrounds: newBackgrounds };
            }),
            getChatBackground: (chatId) => get().chatBackgrounds[chatId] || null,
        }),
        {
            name: 'vortex-theme-storage',
        }
    )
);
