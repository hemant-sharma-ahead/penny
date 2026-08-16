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
