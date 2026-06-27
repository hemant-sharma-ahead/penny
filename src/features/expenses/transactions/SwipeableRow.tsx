import { useRef, useState, type ReactNode } from 'react';

export interface SwipeAction {
  icon: string;
  label: string;
  color: string;
  onClick: () => void;
}

interface Props {
  actions: SwipeAction[]; // revealed on left-swipe
  onTap: () => void;
  children: ReactNode;
  className?: string;
}

const ACTION_W = 72; // px per action button

/**
 * Swipe-left to reveal row actions (delete/duplicate); tap (no drag) triggers
 * `onTap`. Uses pointer events with `touch-action: pan-y` so vertical scrolling
 * is unaffected — only horizontal drags are captured.
 */
export function SwipeableRow({ actions, onTap, children, className = '' }: Props) {
  const [tx, setTx] = useState(0);
  const [dragging, setDragging] = useState(false);
  const drag = useRef<{ x: number; startTx: number; moved: boolean } | null>(null);
  const openW = actions.length * ACTION_W;

  const onPointerDown = (e: React.PointerEvent) => {
    drag.current = { x: e.clientX, startTx: tx, moved: false };
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!drag.current) return;
    const dx = e.clientX - drag.current.x;
    if (Math.abs(dx) > 4 && !drag.current.moved) {
      drag.current.moved = true;
      setDragging(true);
      e.currentTarget.setPointerCapture(e.pointerId);
    }
    setTx(Math.max(-openW, Math.min(0, drag.current.startTx + dx)));
  };
  const onPointerUp = () => {
    const d = drag.current;
    drag.current = null;
    setDragging(false);
    if (!d) return;
    if (!d.moved) {
      // A tap: close if open, else bubble to onTap.
      if (tx < 0) setTx(0);
      else onTap();
      return;
    }
    setTx(tx < -openW / 2 ? -openW : 0);
  };

  return (
    <div className="relative overflow-hidden">
      {/* Revealed actions (behind) — only mounted while swiping/open, so no 1px sliver leaks at rest. */}
      {tx < 0 && (
        <div className="absolute inset-y-0 right-0 flex">
          {actions.map((a) => (
            <button
              key={a.label}
              onClick={() => {
                a.onClick();
                setTx(0);
              }}
              className="flex flex-col items-center justify-center gap-0.5 text-white text-[10px] font-medium"
              style={{ width: ACTION_W, backgroundColor: a.color }}
              aria-label={a.label}
            >
              <i className={`ti ${a.icon}`} style={{ fontSize: 18 }} aria-hidden="true" />
              {a.label}
            </button>
          ))}
        </div>
      )}
      {/* Foreground content — uses the page background so the list reads as one uniform surface.
          w-full guarantees it fully covers the action buttons behind it at rest. */}
      <div
        className={`relative w-full bg-surface-3 ${className}`}
        style={{
          transform: `translateX(${tx}px)`,
          transition: dragging ? 'none' : 'transform 0.2s',
          touchAction: 'pan-y'
        }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        {children}
      </div>
    </div>
  );
}
