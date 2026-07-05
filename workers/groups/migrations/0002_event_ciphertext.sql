-- Store the encrypted event body inline in D1 instead of R2 (drops the R2 dependency — the blobs are
-- tiny, a few hundred bytes each). Applies to databases already migrated with 0001 (which created
-- group_events with an r2_key column). group_events is append-only and empty at this point.

ALTER TABLE group_events DROP COLUMN r2_key;
ALTER TABLE group_events ADD COLUMN ciphertext TEXT NOT NULL DEFAULT '';
