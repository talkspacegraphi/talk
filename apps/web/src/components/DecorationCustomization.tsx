import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Trash2, Loader2 } from 'lucide-react';
import { api } from '../lib/api';
import { useAuthStore } from '../stores/authStore';
import AvatarDecoration from './AvatarDecoration';

interface DecorationCustomizationProps {
  onClose: () => void;
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

export default function DecorationCustomization({ onClose }: DecorationCustomizationProps) {
  const { user, updateUser } = useAuthStore();
  const [loading, setLoading] = useState(false);
  const [previewDecoration, setPreviewDecoration] = useState<string | null>(user?.avatarDecoration || null);

  const initials = user?.displayName?.slice(0, 2).toUpperCase() || user?.username?.slice(0, 2).toUpperCase() || '??';

  const handleDecorationSelect = async (decorationId: string) => {
    setPreviewDecoration(decorationId === 'none' ? null : decorationId);

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

  const handleRemoveDecoration = async () => {
    setPreviewDecoration(null);
    await handleDecorationSelect('none');
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
          <h2 className="text-lg font-bold text-white">Украшение аватара</h2>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-white/10 text-zinc-400 hover:text-white transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Preview */}
        <div className="flex items-center justify-center py-12 bg-gradient-to-br from-surface to-surface-tertiary">
          <div className="relative">
            {user?.avatar ? (
              <img
                src={user.avatar}
                alt=""
                className="w-32 h-32 rounded-full object-cover ring-4 ring-surface-secondary"
              />
            ) : (
              <div className="w-32 h-32 rounded-full bg-gradient-to-br from-vortex-500 to-purple-600 flex items-center justify-center text-white font-bold text-3xl ring-4 ring-surface-secondary">
                {initials}
              </div>
            )}

            {/* Preview decoration */}
            {previewDecoration && previewDecoration !== 'none' && (
              <AvatarDecoration decoration={previewDecoration} size={128} />
            )}
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-5">
          <div className="space-y-4">
            <h3 className="text-sm font-semibold text-zinc-400 mb-3">Выберите украшение</h3>
            <div className="grid grid-cols-3 gap-3">
              {AVATAR_DECORATIONS.map((decoration) => (
                <button
                  key={decoration.id}
                  onClick={() => handleDecorationSelect(decoration.id)}
                  disabled={loading}
                  className={`p-4 rounded-xl border transition-all hover:scale-105 ${
                    previewDecoration === decoration.id || (!previewDecoration && decoration.id === 'none')
                      ? 'border-vortex-500 bg-vortex-500/10'
                      : 'border-border/50 bg-white/5 hover:bg-white/10'
                  }`}
                >
                  <div className="text-3xl mb-2">{decoration.icon}</div>
                  <div className="text-sm font-medium text-zinc-300">{decoration.name}</div>
                </button>
              ))}
            </div>

            {/* Remove button */}
            {previewDecoration && previewDecoration !== 'none' && (
              <button
                onClick={handleRemoveDecoration}
                disabled={loading}
                className="w-full px-4 py-3 bg-red-500/10 hover:bg-red-500/20 rounded-xl text-red-400 font-medium transition-all flex items-center justify-center gap-2 mt-4"
              >
                {loading ? <Loader2 size={18} className="animate-spin" /> : <Trash2 size={18} />}
                Сбросить украшение
              </button>
            )}
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}
