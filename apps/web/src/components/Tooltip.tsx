import { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';

interface TooltipProps {
  children: React.ReactNode;
  text: string;
  shortcut?: string;
  side?: 'top' | 'bottom';
}

export default function Tooltip({ children, text, shortcut, side = 'top' }: TooltipProps) {
  const [show, setShow] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number }>({ top: 0, left: 0 });
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const triggerRef = useRef<HTMLDivElement>(null);

  const updatePosition = useCallback(() => {
    if (!triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    const gap = 8;

    if (side === 'top') {
      setPos({ top: rect.top - gap, left: rect.left + rect.width / 2 });
    } else {
      setPos({ top: rect.bottom + gap, left: rect.left + rect.width / 2 });
    }
  }, [side]);

  const handleEnter = useCallback(() => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => {
      updatePosition();
      setShow(true);
    }, 350);
  }, [updatePosition]);

  const handleLeave = useCallback(() => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    setShow(false);
  }, []);

  // Update position on scroll/resize while visible
  useEffect(() => {
    if (!show) return;
    const onReposition = () => updatePosition();
    window.addEventListener('scroll', onReposition, { passive: true, capture: true });
    window.addEventListener('resize', onReposition, { passive: true });
    return () => {
      window.removeEventListener('scroll', onReposition, true);
      window.removeEventListener('resize', onReposition);
    };
  }, [show, updatePosition]);

  useEffect(() => {
    return () => { if (timeoutRef.current) clearTimeout(timeoutRef.current); };
  }, []);

  return (
    <div
      ref={triggerRef}
      className="inline-flex"
      onMouseEnter={handleEnter}
      onMouseLeave={handleLeave}
      onFocus={handleEnter}
      onBlur={handleLeave}
    >
      {children}
      {createPortal(
        <AnimatePresence>
          {show && (
            <motion.div
              initial={{ opacity: 0, y: side === 'top' ? 4 : -4, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: side === 'top' ? 4 : -4, scale: 0.96 }}
              transition={{ duration: 0.1, ease: 'easeOut' }}
              className="fixed z-[99999] pointer-events-none"
              style={{
                top: side === 'top' ? `${pos.top}px` : undefined,
                bottom: side === 'bottom' ? `${window.innerHeight - pos.top}px` : undefined,
                left: `${pos.left}px`,
                transform: `translateX(-50%) ${side === 'top' ? 'translateY(-100%)' : ''}`,
              }}
            >
              <div className="relative px-2.5 py-1.5 bg-[#1e1f22] border border-white/[0.08] rounded-lg shadow-xl whitespace-nowrap">
                <div className="flex items-center gap-2">
                  <span className="text-xs text-zinc-200 font-medium">{text}</span>
                  {shortcut && (
                    <span className="text-[10px] text-zinc-400 font-mono bg-white/[0.06] px-1.5 py-0.5 rounded">{shortcut}</span>
                  )}
                </div>
                {/* Arrow */}
                <div
                  className={`absolute left-1/2 -translate-x-1/2 w-2 h-2 bg-[#1e1f22] border-white/[0.08] ${
                    side === 'top'
                      ? 'top-full border-r border-b rotate-45 -mt-[5px]'
                      : 'bottom-full border-l border-t rotate-45 -mb-[5px]'
                  }`}
                />
              </div>
            </motion.div>
          )}
        </AnimatePresence>,
        document.body
      )}
    </div>
  );
}
