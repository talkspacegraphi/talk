import React from 'react';
import { X, Minus, Square } from 'lucide-react';

export default function CustomTitleBar() {
  const [isMaximized, setIsMaximized] = React.useState(false);

  const handleMinimize = () => {
    if (window.electronAPI) {
      window.electronAPI.windowMinimize();
    }
  };

  const handleMaximize = () => {
    if (window.electronAPI) {
      window.electronAPI.windowMaximize();
      setIsMaximized(!isMaximized);
    }
  };

  const handleClose = () => {
    if (window.electronAPI) {
      window.electronAPI.windowClose();
    }
  };

  // Проверяем, запущено ли в Electron и не на мобильном
  const isElectron = typeof window !== 'undefined' && window.electronAPI;
  const isMobile = typeof window !== 'undefined' && window.innerWidth < 768;

  if (!isElectron || isMobile) return null;

  return (
    <div
      className="fixed top-0 left-0 right-0 h-8 bg-gradient-to-r from-zinc-900 to-zinc-800 border-b border-zinc-700 flex items-center justify-between px-3 z-50"
      style={{ WebkitAppRegion: 'drag' } as any}
    >
      <div className="flex items-center gap-2">
        <div className="w-5 h-5 rounded-full bg-gradient-to-br from-purple-500 to-blue-500 flex items-center justify-center text-white text-xs font-bold">
          T
        </div>
        <span className="text-xs text-zinc-400 font-medium">Talk Messenger</span>
      </div>

      <div className="flex items-center gap-1" style={{ WebkitAppRegion: 'no-drag' } as any}>
        <button
          onClick={handleMinimize}
          className="w-8 h-8 flex items-center justify-center hover:bg-zinc-700 rounded transition-colors"
          title="Свернуть"
        >
          <Minus size={14} className="text-zinc-400" />
        </button>
        <button
          onClick={handleMaximize}
          className="w-8 h-8 flex items-center justify-center hover:bg-zinc-700 rounded transition-colors"
          title={isMaximized ? "Восстановить" : "Развернуть"}
        >
          <Square size={12} className="text-zinc-400" />
        </button>
        <button
          onClick={handleClose}
          className="w-8 h-8 flex items-center justify-center hover:bg-red-600 rounded transition-colors"
          title="Закрыть"
        >
          <X size={14} className="text-zinc-400 hover:text-white" />
        </button>
      </div>
    </div>
  );
}
