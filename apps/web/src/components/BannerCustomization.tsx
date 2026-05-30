import { useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Upload, Trash2, Loader2 } from 'lucide-react';
import { api } from '../lib/api';
import { useAuthStore } from '../stores/authStore';

interface BannerCustomizationProps {
  onClose: () => void;
}

const BANNER_COLORS = [
  '#6366f1', '#8b5cf6', '#ec4899', '#f43f5e', '#f97316',
  '#eab308', '#22c55e', '#14b8a6', '#06b6d4', '#3b82f6',
  '#a855f7', '#d946ef', '#e11d48', '#dc2626', '#f59e0b',
];

export default function BannerCustomization({ onClose }: BannerCustomizationProps) {
  const { user, updateUser } = useAuthStore();
  const [loading, setLoading] = useState(false);
  const [previewBanner, setPreviewBanner] = useState<string | null>(user?.banner || null);
  const [previewColor, setPreviewColor] = useState<string | null>(user?.bannerColor || null);
  const bannerInputRef = useRef<HTMLInputElement>(null);

  const initials = user?.displayName?.slice(0, 2).toUpperCase() || user?.username?.slice(0, 2).toUpperCase() || '??';

  const handleBannerUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
      alert('Файл слишком большой (макс. 5MB)');
      return;
    }

    // Preview
    const reader = new FileReader();
    reader.onload = (event) => {
      setPreviewBanner(event.target?.result as string);
      setPreviewColor(null);
    };
    reader.readAsDataURL(file);

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

  const handleColorSelect = async (color: string) => {
    setPreviewColor(color);
    setPreviewBanner(null);

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
      setPreviewBanner(null);
      setPreviewColor(null);
    } catch (error) {
      console.error('Remove banner error:', error);
      alert('Ошибка удаления баннера');
    } finally {
      setLoading(false);
    }
  };

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
          <h2 className="text-lg font-bold text-white">Баннер профиля</h2>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-white/10 text-zinc-400 hover:text-white transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Preview */}
        <div className="relative h-48 overflow-hidden bg-gradient-to-br from-vortex-500 to-purple-600">
          {previewBanner ? (
            <img src={previewBanner} alt="" className="w-full h-full object-cover" />
          ) : previewColor ? (
            <div className="w-full h-full" style={{ backgroundColor: previewColor }} />
          ) : (
            <div className="w-full h-full bg-gradient-to-br from-zinc-800 to-zinc-900" />
          )}

          {/* Avatar preview */}
          <div className="absolute bottom-0 left-1/2 -translate-x-1/2 translate-y-1/2">
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
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-5 pt-16">
          <div className="space-y-4">
            {/* Upload section */}
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

            {/* Color picker */}
            <div>
              <h3 className="text-sm font-semibold text-zinc-400 mb-3">Или выбрать цвет</h3>
              <div className="grid grid-cols-5 gap-2">
                {BANNER_COLORS.map((color, index) => (
                  <button
                    key={`color-${index}`}
                    onClick={() => handleColorSelect(color)}
                    disabled={loading}
                    className={`aspect-square rounded-xl transition-all hover:scale-110 ${
                      previewColor === color ? 'ring-2 ring-white ring-offset-2 ring-offset-surface-secondary' : ''
                    }`}
                    style={{ backgroundColor: color }}
                  />
                ))}
              </div>
            </div>

            {/* Remove button */}
            {(previewBanner || previewColor) && (
              <button
                onClick={handleRemoveBanner}
                disabled={loading}
                className="w-full px-4 py-3 bg-red-500/10 hover:bg-red-500/20 rounded-xl text-red-400 font-medium transition-all flex items-center justify-center gap-2"
              >
                <Trash2 size={18} />
                Сбросить баннер
              </button>
            )}
          </div>
        </div>

        {/* Hidden file input */}
        <input
          ref={bannerInputRef}
          type="file"
          accept="image/*,.gif"
          onChange={handleBannerUpload}
          className="hidden"
        />
      </motion.div>
    </motion.div>
  );
}
