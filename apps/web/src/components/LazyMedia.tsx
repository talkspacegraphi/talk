import { useState, useRef, useEffect, useCallback, type ReactNode, type ImgHTMLAttributes } from 'react';

interface LazyMediaProps {
  children: ReactNode;
  className?: string;
  rootMargin?: string;
}

export default function LazyMedia({ children, className = '', rootMargin = '200px' }: LazyMediaProps) {
  const [isVisible, setIsVisible] = useState(false);
  const [hasBeenVisible, setHasBeenVisible] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true);
          setHasBeenVisible(true);
        } else {
          setIsVisible(false);
        }
      },
      { rootMargin, threshold: 0 }
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, [rootMargin]);

  // Once media has been visible, keep it mounted (don't show placeholder again)
  const showChildren = isVisible || hasBeenVisible;

  return (
    <div ref={ref} className={className}>
      {showChildren ? children : (
        <div className="w-full h-32 bg-white/[0.03] rounded-xl animate-pulse flex items-center justify-center">
          <div className="w-8 h-8 border-2 border-white/10 border-t-white/30 rounded-full animate-spin" />
        </div>
      )}
    </div>
  );
}

/**
 * Lazy image that unloads when scrolled off-screen.
 * Replaces <img> tags that should be memory-efficient.
 */
export function LazyImage({ src, alt, className, ...props }: ImgHTMLAttributes<HTMLImageElement>) {
  const [loaded, setLoaded] = useState(false);
  const [inView, setInView] = useState(false);
  const imgRef = useRef<HTMLImageElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        setInView(entry.isIntersecting);
      },
      { rootMargin: '300px', threshold: 0 }
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const handleLoad = useCallback(() => setLoaded(true), []);

  return (
    <div ref={containerRef} className={className}>
      {inView && src ? (
        <img
          ref={imgRef}
          src={src}
          alt={alt || ''}
          loading="lazy"
          decoding="async"
          onLoad={handleLoad}
          className={`transition-opacity duration-300 ${loaded ? 'opacity-100' : 'opacity-0'}`}
          {...props}
        />
      ) : (
        <div className="w-full h-full bg-white/[0.03] animate-pulse rounded" />
      )}
    </div>
  );
}
