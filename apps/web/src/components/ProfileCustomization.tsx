import { useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Upload, Palette, Sparkles, Loader2 } from 'lucide-react';
import { api } from '../lib/api';
import { useAuthStore } from '../stores/authStore';
import AvatarDecoration from './AvatarDecoration';

interface ProfileCustomizationProps {
  onClose: () => void;
  initialTab?: 'banner' | 'decoration';
}

const AVATAR_DECORATIONS = [
  { id: 'none', name: 'Нет', icon: '✖️' },
  { id: 'headphones', name: 'Наушники', icon: '🎧' },
  { id: 'roses', name: 'Розы', icon: '🌹' },
  { id: 'crown', name: 'Корона', icon: '👑' },
  { id: 'halo', name: 'Нимб', icon: '😇' },
  { id: 'fire', name: 'Огонь', icon: '🔥' },
  { id: 'sparkles', name: 'Искры', icon: '✨' },
  { id: 'hearts', name: 'Сердца', icon: '💕' },
  { id: 'stars', name: 'Звёзды', icon: '⭐' },
];

const BANNER_COLORS = [
  '#6366f1', '#8b5cf6', '#ec4899', '#f43f5e', '#f97316',
  '#eab308', '#22c55e', '#14b8a6', '#06b6d4', '#3b82f6',
  '#6366f1', '#a855f7', '#d946ef', '#e11d48', '#dc2626',
];

export default function ProfileCustomization({ onClose, initialTab = 'decoration' }: ProfileCustomizationProps) {
  const { user, updateUser } = useAuthStore();
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<'banner' | 'decoration'>(initialTab);

  const bannerInputRef = useRef<HTMLInputElement>(null);
  const avatarInputRef = useRef<HTMLInputElement>(null);

  const handleBannerUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Check file size (5MB max)
    if (file.size > 5 * 1024 * 1024) {
      alert('Файл слишком большой (макс. 5MB)');
      return;
    }

    try {
      setLoading(true);
      const updatedUser = await api.uploadBanner(file);
      updateUser(updatedUser);
    } catch (error) {
      console.error('Banner upload error:', error);
      alert('Ошибка загрузки баннера');
    } finally {
      setLoading(false);
    }
  };

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
      alert('Файл слишком большой (макс. 5MB)');
      return;
    }

    try {
      setLoading(true);
      const updatedUser = await api.uploadAvatar(file);
      updateUser(updatedUser);
    } catch (error) {
      console.error('Avatar upload error:', error);
      alert('Ошибка загрузки аватара');
    } finally {
      setLoading(false);
    }
  };

  const handleBannerColorSelect = async (color: string) => {
    try {
      setLoading(true);
      const updatedUser = await api.setBannerColor(color);
      updateUser(updatedUser);
    } catch (error) {
      console.error('Banner color error:', error);
      alert('Ошибка установки цвета');
    } finally {
      setLoading(false);
    }
  };

  const handleRemoveBanner = async () => {
    try {
      setLoading(true);
      const updatedUser = await api.removeBanner();
      updateUser(updatedUser);
    } catch (error) {
      console.error('Remove banner error:', error);
      alert('Ошибка удаления баннера');
    } finally {
      setLoading(false);
    }
  };

  const handleDecorationSelect = async (decorationId: string) => {
    try {
      setLoading(true);
      const updatedUser = await api.setAvatarDecoration(decorationId);
      updateUser(updatedUser);
    } catch (error) {
      console.error('Decoration error:', error);
      alert('Ошибка установки украшения');
    } finally {
      setLoading(false);
    }
  };

  const initials = user?.displayName?.slice(0, 2).toUpperCase() || user?.username?.slice(0, 2).toUpperCase() || '??';

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.95, opacity: 0 }}
        onClick={(e) => e.stopPropagation()}
        className="bg-surface-secondary rounded-3xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col border border-border"
      >
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-border/50">
          <h2 className="text-lg font-bold text-white">Настройка профиля</h2>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-white/10 text-zinc-400 hover:text-white transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Preview */}
        <div className="relative h-48 overflow-hidden">
          {/* Banner */}
          {user?.banner ? (
            <img src={user.banner} alt="" className="w-full h-full object-cover" />
          ) : user?.bannerColor ? (
            <div className="w-full h-full" style={{ backgroundColor: user.bannerColor }} />
          ) : (
            <div className="w-full h-full bg-gradient-to-br from-vortex-500 to-purple-600" />
          )}

          {/* Avatar with decoration */}
          <div className="absolute bottom-0 left-1/2 -translate-x-1/2 translate-y-1/2">
            <div className="relative">
              {user?.avatar ? (
                <img
                  src={user.avatar}
                  alt=""
                  className="w-24 h-24 rounded-full object-cover ring-4 ring-surface-secondary"
                />
              ) : (
                <div className="w-24 h-24 rounded-full bg-gradient-to-br from-vortex-500 to-purple-600 flex items-center justify-center text-white font-bold text-2xl ring-4 ring-surface-secondary">
                  {initials}
                </div>
              )}

              {/* Decoration overlay */}
              {user?.avatarDecoration && user.avatarDecoration !== 'none' && (
                <AvatarDecoration decoration={user.avatarDecoration} size={96} />
              )}

              {/* Edit avatar button */}
              <button
                onClick={() => avatarInputRef.current?.click()}
                disabled={loading}
                className="absolute bottom-0 right-0 w-8 h-8 bg-vortex-500 hover:bg-vortex-600 rounded-full flex items-center justify-center text-white transition-colors"
              >
                <Upload size={14} />
              </button>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-2 px-5 pt-16 pb-4 border-b border-border/50">
          <button
            onClick={() => setActiveTab('banner')}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl font-medium transition-all ${
              activeTab === 'banner'
                ? 'bg-vortex-500 text-white'
                : 'bg-white/5 text-zinc-400 hover:bg-white/10'
            }`}
          >
            <Palette size={16} />
            Баннер
          </button>
          <button
            onClick={() => setActiveTab('decoration')}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl font-medium transition-all ${
              activeTab === 'decoration'
                ? 'bg-vortex-500 text-white'
                : 'bg-white/5 text-zinc-400 hover:bg-white/10'
            }`}
          >
            <Sparkles size={16} />
            Украшения
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-5">
          {activeTab === 'banner' && (
            <div className="space-y-4">
              <div>
                <h3 className="text-sm font-semibold text-zinc-400 mb-3">Загрузить изображение или GIF</h3>
                <button
                  onClick={() => bannerInputRef.current?.click()}
                  disabled={loading}
                  className="w-full px-4 py-3 bg-white/5 hover:bg-white/10 rounded-xl border border-border/50 text-zinc-300 font-medium transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  {loading ? <Loader2 size={18} className="animate-spin" /> : <Upload size={18} />}
                  Загрузить баннер
                </button>
              </div>

              <div>
                <h3 className="text-sm font-semibold text-zinc-400 mb-3">Или выбрать цвет</h3>
                <div className="grid grid-cols-5 gap-2">
                  {BANNER_COLORS.map((color, index) => (
                    <button
                      key={`color-${index}`}
                      onClick={() => handleBannerColorSelect(color)}
                      disabled={loading}
                      className={`aspect-square rounded-xl transition-all hover:scale-110 ${
                        user?.bannerColor === color ? 'ring-2 ring-white ring-offset-2 ring-offset-surface-secondary' : ''
                      }`}
                      style={{ backgroundColor: color }}
                    />
                  ))}
                </div>
              </div>

              {(user?.banner || user?.bannerColor) && (
                <button
                  onClick={handleRemoveBanner}
                  disabled={loading}
                  className="w-full px-4 py-3 bg-red-500/10 hover:bg-red-500/20 rounded-xl text-red-400 font-medium transition-all"
                >
                  Удалить баннер
                </button>
              )}
            </div>
          )}

          {activeTab === 'decoration' && (
            <div>
              <h3 className="text-sm font-semibold text-zinc-400 mb-3">Выберите украшение для аватара</h3>
              <div className="grid grid-cols-3 gap-3">
                {AVATAR_DECORATIONS.map((decoration) => (
                  <button
                    key={decoration.id}
                    onClick={() => handleDecorationSelect(decoration.id)}
                    disabled={loading}
                    className={`p-4 rounded-xl border transition-all hover:scale-105 ${
                      user?.avatarDecoration === decoration.id || (!user?.avatarDecoration && decoration.id === 'none')
                        ? 'border-vortex-500 bg-vortex-500/10'
                        : 'border-border/50 bg-white/5 hover:bg-white/10'
                    }`}
                  >
                    <div className="text-3xl mb-2">{decoration.icon}</div>
                    <div className="text-sm font-medium text-zinc-300">{decoration.name}</div>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Hidden file inputs */}
        <input
          ref={bannerInputRef}
          type="file"
          accept="image/*,.gif"
          onChange={handleBannerUpload}
          className="hidden"
        />
        <input
          ref={avatarInputRef}
          type="file"
          accept="image/*,.gif"
          onChange={handleAvatarUpload}
          className="hidden"
        />
      </motion.div>
    </motion.div>
  );
}
