import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { FormField } from './FormField';

interface SelectOption {
  value: string;
  label: string;
}

interface SelectInputProps {
  label?: string;
  value: string;
  onChange: (value: string) => void;
  options: SelectOption[];
  placeholder?: string;
  required?: boolean;
  disabled?: boolean;
  error?: string;
  hint?: string;
}

interface PanelPos {
  left: number;
  width: number;
  maxHeight: number;
  top?: number;
  bottom?: number;
}

const GAP = 4;
const DESIRED_HEIGHT = 240;

export function SelectInput({
  label,
  value,
  onChange,
  options,
  placeholder,
  required,
  disabled,
  error,
  hint
}: SelectInputProps) {
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<PanelPos | null>(null);

  const selectedOption = options.find((o) => o.value === value);

  const computePos = useCallback(() => {
    const el = triggerRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const spaceBelow = window.innerHeight - r.bottom - GAP;
    const spaceAbove = r.top - GAP;
    const below = spaceBelow >= Math.min(DESIRED_HEIGHT, 160) || spaceBelow >= spaceAbove;
    const maxHeight = Math.max(120, Math.min(DESIRED_HEIGHT, below ? spaceBelow : spaceAbove));
    setPos({
      left: r.left,
      width: r.width,
      maxHeight,
      ...(below ? { top: r.bottom + GAP } : { bottom: window.innerHeight - r.top + GAP })
    });
  }, []);

  // Position the panel on open, and keep it pinned to the field while scrolling/resizing.
  useLayoutEffect(() => {
    if (!open) return;
    computePos();
    const onMove = () => computePos();
    window.addEventListener('scroll', onMove, true);
    window.addEventListener('resize', onMove);
    return () => {
      window.removeEventListener('scroll', onMove, true);
      window.removeEventListener('resize', onMove);
    };
  }, [open, computePos]);

  // Dismiss on outside click or Escape.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (triggerRef.current?.contains(t) || panelRef.current?.contains(t)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const triggerEl = (
    <div className="relative">
      <button
        ref={triggerRef}
        type="button"
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        style={error ? { borderColor: 'var(--color-open)' } : undefined}
        className="input-surface border w-full rounded-xl px-3 py-2.5 text-sm text-left pr-8 focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)] disabled:opacity-50 disabled:cursor-not-allowed"
      >
        <span className={`block truncate ${selectedOption ? '' : 'text-tertiary'}`}>
          {selectedOption ? selectedOption.label : (placeholder ?? 'Select…')}
        </span>
      </button>
      <i
        className="ti ti-chevron-down absolute right-3 top-1/2 text-tertiary pointer-events-none transition-transform"
        style={{ fontSize: 14, transform: open ? 'translateY(-50%) rotate(180deg)' : 'translateY(-50%)' }}
        aria-hidden="true"
      />
    </div>
  );

  const panel =
    open && pos
      ? createPortal(
          <div
            ref={panelRef}
            role="listbox"
            className="fixed rounded-xl border border-theme bg-surface shadow-lg overflow-y-auto py-1"
            style={{
              left: pos.left,
              width: pos.width,
              maxHeight: pos.maxHeight,
              zIndex: 90,
              ...(pos.top !== undefined ? { top: pos.top } : { bottom: pos.bottom })
            }}
          >
            {options.length === 0 ? (
              <p className="px-3 py-2 text-xs text-tertiary">No options</p>
            ) : (
              options.map((opt) => {
                const sel = opt.value === value;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    role="option"
                    aria-selected={sel}
                    onClick={() => {
                      onChange(opt.value);
                      setOpen(false);
                    }}
                    className="w-full text-left px-3 py-2 text-sm flex items-center gap-2 hover:bg-surface-2"
                    style={
                      sel ? { color: 'var(--color-primary)', fontWeight: 600 } : { color: 'var(--color-text-primary)' }
                    }
                  >
                    <span className="flex-1 truncate">{opt.label}</span>
                    {sel && <i className="ti ti-check flex-shrink-0" style={{ fontSize: 14 }} aria-hidden="true" />}
                  </button>
                );
              })
            )}
          </div>,
          document.body
        )
      : null;

  const content = (
    <>
      {triggerEl}
      {panel}
    </>
  );

  if (!label) return content;

  return (
    <FormField label={label} required={required} hint={hint} error={error}>
      {content}
    </FormField>
  );
}
