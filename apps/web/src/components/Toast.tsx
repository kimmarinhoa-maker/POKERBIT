'use client';

import { useState, useCallback, useRef, useEffect, createContext, useContext, ReactNode } from 'react';
import { X } from 'lucide-react';

type ToastType = 'success' | 'error' | 'info';

interface ToastItem {
  id: number;
  message: string;
  type: ToastType;
  exiting?: boolean;
}

interface ToastContextValue {
  toast: (message: string, type?: ToastType) => void;
}

const ToastContext = createContext<ToastContextValue>({ toast: () => {} });

export function useToast() {
  return useContext(ToastContext);
}

let nextId = 0;
const MAX_TOASTS = 5;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const timersRef = useRef<Map<number, NodeJS.Timeout>>(new Map());

  // Clear all timers on unmount
  useEffect(() => {
    const timers = timersRef.current;
    return () => {
      timers.forEach((timer) => clearTimeout(timer));
      timers.clear();
    };
  }, []);

  const dismissToast = useCallback((id: number) => {
    // Start exit animation
    setToasts((prev) => prev.map((t) => (t.id === id ? { ...t, exiting: true } : t)));
    // Remove after animation
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 200);
    const timer = timersRef.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timersRef.current.delete(id);
    }
  }, []);

  const toast = useCallback((message: string, type: ToastType = 'info') => {
    const id = ++nextId;
    setToasts((prev) => {
      const next = [...prev, { id, message, type }];
      // Cap queue — dismiss oldest if over limit
      if (next.length > MAX_TOASTS) {
        const oldest = next[0];
        setTimeout(() => dismissToast(oldest.id), 0);
      }
      return next;
    });
    const timer = setTimeout(() => {
      dismissToast(id);
    }, 3500);
    timersRef.current.set(id, timer);
  }, [dismissToast]);

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      {/* Toast container */}
      <div
        className="fixed bottom-6 right-6 z-50 flex flex-col gap-2 pointer-events-none"
        aria-live="assertive"
        aria-atomic="true"
      >
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`pointer-events-auto flex items-center gap-2 px-4 py-3 rounded-lg text-sm font-medium shadow-toast backdrop-blur-sm border transition-all duration-200 ${
              t.exiting ? 'opacity-0 translate-x-4' : 'animate-slide-up'
            } ${
              t.type === 'success'
                ? 'bg-emerald-900/90 border-emerald-700/50 text-emerald-200'
                : t.type === 'error'
                  ? 'bg-red-900/90 border-red-700/50 text-red-200'
                  : 'bg-dark-800/95 border-dark-600 text-white'
            }`}
            role="alert"
          >
            <span className="flex-1">
              {t.type === 'success' && '\u2713 '}
              {t.type === 'error' && '\u2715 '}
              {t.message}
            </span>
            <button
              onClick={() => dismissToast(t.id)}
              className="shrink-0 text-current opacity-50 hover:opacity-100 transition-opacity p-0.5 -mr-1"
              aria-label="Fechar notificacao"
            >
              <X size={14} />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
