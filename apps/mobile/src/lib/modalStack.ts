// Tiny module-level "is any real native `<Modal>` currently open" tracker. The only two places in
// this app that ever mount RN's own `Modal` directly are `~/components/ui/Modal.tsx` (the shared
// centered-modal primitive everything else in the app builds on) and `~/context/ToastContext.tsx`
// itself — `ui/Modal.tsx` registers here on mount/unregisters on unmount, and `ToastContext.tsx` reads
// it to decide how to render a toast. See that file's own doc comment for the full reasoning: a real
// native Modal is only needed at all when the toast must stack above an *already-open* modal (Android's
// Dialog-backed Modal window always intercepts every touch within it, `pointerEvents` or not — an
// inherent platform limitation, not something this app's own JS can opt out of); the common case (no
// other modal open) renders the toast as a plain absolutely-positioned view instead, so taps on the
// rest of the screen behave exactly like taps on any other overlapping sibling view — no interception
// at all, since there's no separate native window in that path.
let openCount = 0;
const listeners = new Set<() => void>();

function emit(): void {
  for (const l of listeners) l();
}

export function registerModalOpen(): void {
  openCount += 1;
  emit();
}

export function unregisterModalOpen(): void {
  openCount = Math.max(0, openCount - 1);
  emit();
}

export function isAnyModalOpen(): boolean {
  return openCount > 0;
}

export function subscribeModalOpen(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
