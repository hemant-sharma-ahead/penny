// Encrypted backup/restore for all Penny data.
//
// File format (.penny):
//   v2 (envelope): { version: 2, wrappedMasterKeyByPassphrase, passphraseKekSalt, iv, ciphertext }
//   v1 (legacy):   { version: 1, mkSalt, iv, ciphertext }
//
// The bundle (inside ciphertext) holds all raw Dexie records for every encrypted
// store, plus the security record. Plain stores (price_cache, privacy_stats) are
// excluded — they rebuild automatically.
//
// The bundle is encrypted with the Data Master Key (DMK). To let restore recover the
// DMK from the passphrase, v2 carries the passphrase-wrapped DMK (already present in
// the security record) in the file header — useless without the passphrase. v1 files
// (legacy, passphrase-derived MK) remain restorable.
//
// On restore: passphrase → DMK → decrypt bundle → bulk-put records → lock session →
// user re-enters PIN.

import { db } from '@/core/db/schema';
import { deriveKey, decrypt, encrypt, unwrapKey } from '@/core/crypto/engine';
import { keystore } from '@/core/crypto/keystore';
import { lockSession } from '@/core/crypto/securityManager';
import type { SecurityRecord } from '@/core/db/types';

const BACKUP_VERSION = 2 as const;
const MK_ITERATIONS = 600_000;

// All encrypted stores. Excludes price_cache and privacy_stats (plain, rebuildable).
const BACKUP_STORES = [
  'security',
  'profile',
  'holdings',
  'expenses',
  'expense_categories',
  'budgets',
  'hashtags',
  'goals',
  'goal_contributions',
  'liabilities',
  'insurance_policies',
  'chip_insights',
  'ai_call_log',
  'subscriptions',
  'personal_ious',
  'credit_profile'
] as const;

type BackupStore = (typeof BACKUP_STORES)[number];

interface BackupFileV1 {
  version: 1;
  mkSalt: string;
  iv: string;
  ciphertext: string;
}
interface BackupFileV2 {
  version: 2;
  wrappedMasterKeyByPassphrase: string;
  passphraseKekSalt: string;
  iv: string;
  ciphertext: string;
}
type BackupFile = BackupFileV1 | BackupFileV2;

function bufferToBase64(buf: ArrayBuffer): string {
  return btoa(String.fromCharCode(...new Uint8Array(buf)));
}

function base64ToBuffer(b64: string): ArrayBuffer {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

export async function exportBackup(): Promise<Blob> {
  const mk = keystore.getMasterKey(); // throws if session not active

  const stores: Record<string, unknown[]> = {};
  for (const name of BACKUP_STORES) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    stores[name] = await (db as any)[name].toArray();
  }

  const securityRow = (stores['security'] as SecurityRecord[])[0];
  if (!securityRow) throw new Error('No security record — cannot create backup');

  const plaintext = new TextEncoder().encode(JSON.stringify({ exportedAt: Date.now(), stores }));
  const { iv, ciphertext } = await encrypt(mk, plaintext);

  // The header carries what restore needs to recover the DMK from the passphrase.
  let file: BackupFile;
  if (securityRow.encryptedMasterKeyByPassphrase && securityRow.passphraseKekSalt) {
    file = {
      version: BACKUP_VERSION,
      wrappedMasterKeyByPassphrase: securityRow.encryptedMasterKeyByPassphrase,
      passphraseKekSalt: securityRow.passphraseKekSalt,
      iv: bufferToBase64(iv),
      ciphertext: bufferToBase64(ciphertext)
    };
  } else if (securityRow.mkSalt) {
    // Legacy vault not yet migrated to envelope encryption.
    file = { version: 1, mkSalt: securityRow.mkSalt, iv: bufferToBase64(iv), ciphertext: bufferToBase64(ciphertext) };
  } else {
    throw new Error('Vault has no passphrase key — change your passphrase once to enable backup');
  }

  return new Blob([JSON.stringify(file)], { type: 'application/json' });
}

export async function importBackup(fileText: string, passphrase: string): Promise<void> {
  let file: BackupFile;
  try {
    file = JSON.parse(fileText) as BackupFile;
  } catch {
    throw new Error('Invalid backup file — could not parse JSON');
  }

  // Recover the data key from the passphrase.
  let mk: CryptoKey;
  if (file.version === 1) {
    mk = await deriveKey(passphrase, base64ToBuffer(file.mkSalt), MK_ITERATIONS);
  } else if (file.version === 2) {
    try {
      const passKek = await deriveKey(passphrase, base64ToBuffer(file.passphraseKekSalt), MK_ITERATIONS);
      mk = await unwrapKey(base64ToBuffer(file.wrappedMasterKeyByPassphrase), passKek);
    } catch {
      throw new Error('Incorrect passphrase or corrupted backup file');
    }
  } else {
    throw new Error(`Unsupported backup version: ${String((file as { version: unknown }).version)}`);
  }

  let plaintext: ArrayBuffer;
  try {
    plaintext = await decrypt(mk, base64ToBuffer(file.iv), base64ToBuffer(file.ciphertext));
  } catch {
    throw new Error('Incorrect passphrase or corrupted backup file');
  }

  const bundle = JSON.parse(new TextDecoder().decode(plaintext)) as {
    exportedAt: number;
    stores: Record<string, unknown[]>;
  };

  // Restore each store: clear existing records, then bulk-put from backup.
  for (const name of BACKUP_STORES) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const table = (db as any)[name] as { clear(): Promise<void>; bulkPut(rows: unknown[]): Promise<unknown> };
    await table.clear();
    const rows = bundle.stores[name as BackupStore];
    if (rows?.length) {
      await table.bulkPut(rows);
    }
  }

  // Lock session — user must re-enter their original PIN after restore.
  lockSession();
}
