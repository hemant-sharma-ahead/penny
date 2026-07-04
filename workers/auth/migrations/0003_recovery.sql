-- Track F (F3): passphrase-based account recovery (WhatsApp-style handle reclaim).
-- Scheme A — a per-account Ed25519 recovery keypair derived from the user's passphrase:
--   recovery_pubkey = public half (verifier); server stores ONLY the public key → not password-
--   equivalent, DB-leak can't be replayed (reclaim proves ownership by signing a fresh nonce).
--   recovery_salt   = the salt the client fed into KDF(passphrase, salt) → keypair (server relays it
--                     back at /recover/start so the client can re-derive the same key after a wipe).
-- Both nullable: accounts claimed before this feature simply can't reclaim by passphrase (Drive
-- backup restore remains their path). Nothing here is secret or PII (Model B preserved).
ALTER TABLE users ADD COLUMN recovery_salt TEXT;
ALTER TABLE users ADD COLUMN recovery_pubkey TEXT;
