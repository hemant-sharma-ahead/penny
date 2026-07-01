// Username format rule — MUST stay identical to the client's src/core/profile/username.ts
// (3–20 lowercase alphanumeric + underscore). Duplicated here because the worker is a separate
// TypeScript project; keep the two regexes in sync.

export const USERNAME_PATTERN = /^[a-z0-9_]{3,20}$/;

export function isValidUsername(username: string): boolean {
  return USERNAME_PATTERN.test(username);
}
