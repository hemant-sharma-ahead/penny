// Small, generic DOM helpers with zero dependency on the tool's own state/rendering — the
// `el()` builder, clipboard/download helpers, and the toast notification. Split out so the rest of the
// tool's modules can stay focused on what they actually render, not how a DOM node gets built.

export type ElProps<K extends keyof HTMLElementTagNameMap> = Omit<Partial<HTMLElementTagNameMap[K]>, 'style'> & {
  className?: string;
  style?: Partial<CSSStyleDeclaration>;
};

export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: ElProps<K> = {} as ElProps<K>,
  children: (Node | string)[] = []
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  // `style` needs its own path — a real element's `.style` is a live CSSStyleDeclaration, not a plain
  // object; assigning a plain object to it via a blind Object.assign silently does nothing useful.
  const { style, ...rest } = props;
  Object.assign(node, rest);
  if (style) Object.assign(node.style, style);
  for (const child of children) node.append(child);
  return node;
}

/** Runs `rebuild()` — typically ending in a `container.replaceChildren(...)` that tears down and
 *  recreates every child — while preserving focus and cursor position on a text input/textarea living
 *  inside `container`. Without this, a live-filtered search box loses focus on its very first keystroke
 *  (the old, focused `<input>` is destroyed and a new one takes its place, and the browser doesn't move
 *  focus to it) — making it impossible to type more than one character without re-clicking into the box
 *  each time. `matches` is a CSS selector specific enough to re-find "the same logical input" in the
 *  freshly rebuilt DOM (e.g. `.toolsrow input`) — the actual element instance is necessarily a new one. */
export function withFocusPreserved(container: HTMLElement, matches: string, rebuild: () => void): void {
  const active = document.activeElement;
  const hadFocus = active instanceof HTMLElement && container.contains(active) && active.matches(matches);
  const input = hadFocus ? (active as HTMLInputElement | HTMLTextAreaElement) : null;
  const selStart = input?.selectionStart ?? null;
  const selEnd = input?.selectionEnd ?? null;
  rebuild();
  if (!hadFocus) return;
  const restored = container.querySelector(matches);
  if (restored instanceof HTMLInputElement || restored instanceof HTMLTextAreaElement) {
    restored.focus();
    if (selStart !== null && selEnd !== null) restored.setSelectionRange(selStart, selEnd);
  }
}

function legacyCopy(text: string): void {
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.append(ta);
    ta.select();
    document.execCommand('copy');
    ta.remove();
  } catch {
    // Both copy paths failed (e.g. a sandboxed context) — nothing more can be safely done here; the
    // caller's own toast still confirms the click registered even if a manual copy is now needed.
  }
}

/** `navigator.clipboard` isn't guaranteed available — this tool is explicitly designed to be downloaded
 *  and opened via `file://` (see its own README), where the async Clipboard API can be missing entirely
 *  depending on the browser, not just rejected. Falls back to the legacy `execCommand('copy')` path via a
 *  throwaway textarea rather than letting every single copy action in the tool throw uncaught. */
export function copyText(text: string): void {
  if (navigator.clipboard?.writeText) {
    navigator.clipboard.writeText(text).catch(() => legacyCopy(text));
  } else {
    legacyCopy(text);
  }
}

export function downloadTextFile(filename: string, content: string): void {
  const blob = new Blob([content], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = el('a', { href: url, download: filename });
  document.body.append(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

let toastEl: HTMLElement | null = null;
let toastTimer: ReturnType<typeof setTimeout> | undefined;

/** Mounts the one shared toast element — call once from the tool's own `mount()`. */
export function initToast(): void {
  toastEl = el('div', { className: 'copytoast' }, ['Copied']);
  document.body.append(toastEl);
}

export function showToast(message: string): void {
  if (!toastEl) return;
  toastEl.textContent = message;
  toastEl.classList.add('show');
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastEl?.classList.remove('show'), 1600);
}
