// Username format — must match the server's rule so a locally chosen name can be
// claimed unchanged at Phase 1.5 registration. The username is provisional and
// optional in Phase 1; the server enforces global uniqueness when it's claimed.
export const USERNAME_PATTERN = /^[a-z0-9_]{3,20}$/;

export function isValidUsername(username: string): boolean {
  return USERNAME_PATTERN.test(username);
}
