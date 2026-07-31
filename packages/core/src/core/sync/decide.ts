// Pure sync-decision logic (no I/O) so the engine's branching is unit-testable.

export type BackupTarget = 'google-drive' | 'icloud' | 'local' | null;

export interface SyncInputs {
  target: BackupTarget;
  canRun: boolean; // session unlocked + entitled + online (+ provider available for cloud)
  remoteChanged: boolean; // cloud only: remoteTag differs from the stored cursor tag
  localDirty: boolean; // local changes since the last successful push
  dueDaily: boolean; // no successful backup in the last ~24h
}

export interface SyncDecision {
  pull: boolean; // cloud: download + mergeBundle
  push: boolean; // cloud: export + upload
  localSnapshot: boolean; // local target: export + OPFS snapshot
}

const NONE: SyncDecision = { pull: false, push: false, localSnapshot: false };

/**
 * Decide what a sync run should do. Cloud targets pull when the remote moved, and push when local
 * changed or a daily backup is due. The `local`/no-target case just takes a daily on-device snapshot.
 */
export function decideSync(inputs: SyncInputs): SyncDecision {
  if (!inputs.canRun) return NONE;

  // No cloud target chosen → on-device daily backup floor.
  if (inputs.target === 'local' || inputs.target === null) {
    return { pull: false, push: false, localSnapshot: inputs.dueDaily || inputs.localDirty };
  }

  return {
    pull: inputs.remoteChanged,
    push: inputs.localDirty || inputs.dueDaily,
    localSnapshot: false
  };
}
