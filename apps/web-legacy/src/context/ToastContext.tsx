import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react';

export interface ToastOptions {
  message: string;
  actionLabel?: string;
  onAction?: () => void | Promise<void>;
  durationMs?: number;
}

interface ToastState extends ToastOptions {
  id: number;
}

interface ToastContextValue {
  showToast: (options: ToastOptions) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within a ToastProvider');
  return ctx;
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<ToastState | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const dismiss = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    setToast(null);
  }, []);

  const showToast = useCallback((options: ToastOptions) => {
    if (timer.current) clearTimeout(timer.current);
    const id = Date.now();
    setToast({ id, ...options });
    timer.current = setTimeout(() => setToast(null), options.durationMs ?? 5000);
  }, []);

  async function handleAction() {
    const action = toast?.onAction;
    dismiss();
    if (action) await action();
  }

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      {toast && (
        <div
          className="fixed left-0 right-0 flex justify-center px-4 max-w-[430px] mx-auto"
          style={{ bottom: 'calc(5rem + env(safe-area-inset-bottom, 0px))', zIndex: 85 }}
        >
          <div className="flex items-center gap-3 w-full rounded-xl bg-surface border border-theme shadow-lg px-4 py-3">
            <span className="flex-1 text-sm text-primary">{toast.message}</span>
            {toast.actionLabel && (
              <button
                type="button"
                onClick={() => void handleAction()}
                className="text-sm font-semibold flex-shrink-0"
                style={{ color: 'var(--color-primary)' }}
              >
                {toast.actionLabel}
              </button>
            )}
            <button type="button" onClick={dismiss} aria-label="Dismiss" className="text-tertiary flex-shrink-0">
              <i className="ti ti-x" style={{ fontSize: 15 }} aria-hidden="true" />
            </button>
          </div>
        </div>
      )}
    </ToastContext.Provider>
  );
}
