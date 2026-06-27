import type { ReactNode } from 'react';

interface ModalProps {
  onClose: () => void;
  title?: string;
  children: ReactNode;
  footer?: ReactNode;
  /** sm = max-w-sm (pickers, confirm dialogs), md = max-w-[430px] default */
  size?: 'sm' | 'md' | undefined;
  /** true → z-70 for modals stacked on top of other modals */
  nested?: boolean | undefined;
  /** explicit stacking tier: 1 → z-60, 2 → z-70, 3 → z-80 (overrides `nested`) */
  level?: 1 | 2 | 3 | undefined;
  /** true → body scrolls inside the card instead of growing */
  scrollable?: boolean;
}

export function Modal({
  onClose,
  title,
  children,
  footer,
  size = 'md',
  nested = false,
  level,
  scrollable = false
}: ModalProps) {
  const tier = level ?? (nested ? 2 : 1);
  const zClass = tier === 3 ? 'z-80' : tier === 2 ? 'z-70' : 'z-60';
  const maxW = size === 'sm' ? 'max-w-sm' : 'max-w-[430px]';

  return (
    <div className={`fixed inset-0 ${zClass}`}>
      {/* Full-screen backdrop dims the header + nav too, so the card reads as a floating panel. */}
      <div className="absolute inset-0 bg-black/50" onClick={onClose} aria-hidden="true" />
      <div className="absolute left-0 right-0 flex items-center justify-center px-4" style={{ top: 56, bottom: 72 }}>
        <div
          className={`relative w-full ${maxW} bg-surface rounded-2xl flex flex-col max-h-full border border-theme shadow-2xl`}
        >
          {title !== undefined && (
            <div className="flex items-center justify-between px-5 pt-5 pb-0 flex-shrink-0">
              <h3 className="text-base font-semibold text-primary">{title}</h3>
              <button
                type="button"
                onClick={onClose}
                className="w-8 h-8 flex items-center justify-center rounded-lg text-tertiary hover:bg-surface-2 -mr-1"
                aria-label="Close"
              >
                <i className="ti ti-x" style={{ fontSize: 18 }} aria-hidden="true" />
              </button>
            </div>
          )}

          <div className={`px-5 pt-5 pb-5 flex flex-col gap-4 ${scrollable ? 'overflow-y-auto flex-1' : ''}`}>
            {children}
          </div>

          {footer !== undefined && (
            <div className="px-5 pb-5 flex-shrink-0 border-t border-theme pt-4 -mt-1">{footer}</div>
          )}
        </div>
      </div>
    </div>
  );
}
