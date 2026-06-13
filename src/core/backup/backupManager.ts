// Encrypted backup/restore for all Penny data.
//
// File format (.penny):
//   { version, mkSalt, iv, ciphertext }
//
// mkSalt is stored unencrypted so the importer can re-derive the MK from the
// user's passphrase. The bundle (inside ciphertext) contains all raw Dexie
// records for every encrypted store, plus the security record. Plain stores
// (price_cache, privacy_stats) are excluded — they are rebuilt automatically.
//
// On restore: passphrase → PBKDF2(600K) + mkSalt → MK → decrypt bundle →
// bulk-put records → lock session → user re-enters PIN.

import { db } from '@/core/db/schema';
import { deriveKey, decrypt, encrypt } from '@/core/crypto/engine';
import { keystore } from '@/core/crypto/keystore';
import { lockSession } from '@/core/crypto/securityManager';

const BACKUP_VERSION = 1;
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
  'assets',
  'liabilities',
  'insurance_policies',
  'chip_insights',
  'ai_call_log',
  'subscriptions',
  'personal_ious',
  'credit_profile'
] as const;

type BackupStore = (typeof BACKUP_STORES)[number];

interface BackupFile {
  version: number;
  mkSalt: string;
  iv: string;
  ciphertext: string;
}

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

  // mkSalt must travel unencrypted so the importer can re-derive the MK.
  const securityRows = stores['security'] as Array<{ mkSalt?: string }>;
  const mkSalt = securityRows[0]?.mkSalt;
  if (!mkSalt) throw new Error('No security record — cannot create backup');

  const plaintext = new TextEncoder().encode(JSON.stringify({ exportedAt: Date.now(), stores }));

  const { iv, ciphertext } = await encrypt(mk, plaintext);

  const file: BackupFile = {
    version: BACKUP_VERSION,
    mkSalt,
    iv: bufferToBase64(iv),
    ciphertext: bufferToBase64(ciphertext)
  };

  return new Blob([JSON.stringify(file)], { type: 'application/json' });
}

export async function importBackup(fileText: string, passphrase: string): Promise<void> {
  let file: BackupFile;
  try {
    file = JSON.parse(fileText) as BackupFile;
  } catch {
    throw new Error('Invalid backup file — could not parse JSON');
  }

  if (file.version !== BACKUP_VERSION) {
    throw new Error(`Unsupported backup version: ${String(file.version)}`);
  }

  const mkSalt = base64ToBuffer(file.mkSalt);
  const iv = base64ToBuffer(file.iv);
  const ciphertext = base64ToBuffer(file.ciphertext);

  const mk = await deriveKey(passphrase, mkSalt, MK_ITERATIONS);

  let plaintext: ArrayBuffer;
  try {
    plaintext = await decrypt(mk, iv, ciphertext);
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
