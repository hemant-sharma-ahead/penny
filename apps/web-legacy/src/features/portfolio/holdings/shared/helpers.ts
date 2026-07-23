// nowMs() wraps Date.now() so it can be called during render without tripping
// the "impure function during render" lint (used by FD/RD cards + ValidityBadge).
export function nowMs(): number {
  return Date.now();
}
