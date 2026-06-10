import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Monitor, Laptop, X, Check } from 'lucide-react';

export interface ScreenSource {
  id: string;
  name: string;
  thumbnail: string;
}

interface ScreenSourcePickerProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (sourceId: string) => void;
}

export default function ScreenSourcePicker({ isOpen, onClose, onSelect }: ScreenSourcePickerProps) {
  const [sources, setSources] = useState<ScreenSource[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen && window.electronAPI) {
      setLoading(true);
      setError(null);
      window.electronAPI
        .getScreenSources()
        .then((result) => {
          setSources(result);
          setLoading(false);
        })
        .catch((err) => {
          console.error('Failed to get screen sources:', err);
          setError('Не удалось получить список окон');
          setLoading(false);
        });
    }
  }, [isOpen]);

  const handleSelect = (sourceId: string) => {
    onSelect(sourceId);
    onClose();
  };

  if (!isOpen) return null;

  const isElectron = typeof window !== 'undefined' && !!(window as any).electronAPI;

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[200] bg-black/60 backdrop-blur-sm"
            onClick={onClose}
          />

          {/* Modal */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            className="fixed inset-0 z-[201] flex items-center justify-center p-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="w-full max-w-2xl rounded-2xl bg-zinc-900 border border-zinc-700 shadow-2xl overflow-hidden">
              {/* Header */}
              <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-700">
                <div className="flex items-center gap-3">
                  <Monitor className="w-5 h-5 text-vortex-400" />
                  <h3 className="text-lg font-semibold text-white">
                    {'Выберите окно для демонстрации'}
                  </h3>
                </div>
                <button
                  onClick={onClose}
                  className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-zinc-800 transition-colors"
                >
                  <X className="w-5 h-5 text-zinc-400" />
                </button>
              </div>

              {/* Content */}
              <div className="p-6 max-h-[60vh] overflow-y-auto">
                {loading ? (
                  <div className="flex flex-col items-center justify-center py-12">
                    <div className="w-12 h-12 rounded-full border-2 border-zinc-700 border-t-vortex-500 animate-spin" />
                    <p className="mt-4 text-zinc-400 text-sm">Загрузка списка окон...</p>
                  </div>
                ) : error ? (
                  <div className="flex flex-col items-center justify-center py-12">
                    <p className="text-red-400 text-sm">{error}</p>
                    <button
                      onClick={() => window.electronAPI?.getScreenSources().then((s) => setSources(s)).catch(() => setError('Ошибка'))}
                      className="mt-4 px-4 py-2 rounded-lg bg-vortex-500 hover:bg-vortex-600 text-white text-sm transition-colors"
                    >
                      Повторить
                    </button>
                  </div>
                ) : sources.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-12">
                    <Laptop className="w-12 h-12 text-zinc-600 mb-4" />
                    <p className="text-zinc-400 text-sm">Нет доступных источников</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                    {sources.map((source) => (
                      <button
                        key={source.id}
                        onClick={() => handleSelect(source.id)}
                        className="group relative rounded-xl overflow-hidden border border-zinc-700 hover:border-vortex-500 transition-all hover:shadow-lg hover:shadow-vortex-500/20"
                      >
                        {/* Thumbnail */}
                        <div className="aspect-video bg-zinc-800 overflow-hidden">
                          <img
                            src={source.thumbnail}
                            alt={source.name}
                            className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                            loading="lazy"
                          />
                        </div>

                        {/* Name */}
                        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent p-3">
                          <p className="text-white text-xs font-medium truncate">{source.name}</p>
                        </div>

                        {/* Check indicator */}
                        <div className="absolute top-2 right-2 w-6 h-6 rounded-full bg-vortex-500 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                          <Check className="w-4 h-4 text-white" />
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Footer */}
              <div className="px-6 py-4 border-t border-zinc-700 bg-zinc-800/50">
                <p className="text-zinc-400 text-xs text-center">
                  {'Выберите окно или экран, который хотите продемонстрировать'}
                </p>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
