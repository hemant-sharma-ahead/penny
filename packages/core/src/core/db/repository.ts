import type { RowStore } from './store';
import { decrypt, encrypt } from '@/core/crypto/engine';
import { keystore } from '@/core/crypto/keystore';

// All records stored in encrypted tables have this shape on disk.
interface EncryptedRecord {
  id: string;
  iv: string; // base64
  ciphertext: string; // base64
}

function base64ToBuffer(b64: string): ArrayBuffer {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

// Chunked rather than `btoa(String.fromCharCode(...bytes))` — spreading (or `.apply`-ing) an entire
// large byte array as individual function arguments blows the JS call stack once it's big enough
// (confirmed on-device: a ~9,000-row CSV import's activity-log entry, encrypted as one record, threw
// "Maximum call stack size exceeded" here). 32768 (0x8000) is comfortably under every engine's
// argument-count ceiling, so this scales to any payload size.
const BASE64_CHUNK_SIZE = 0x8000;

function bufferToBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let binary = '';
  for (let i = 0; i < bytes.length; i += BASE64_CHUNK_SIZE) {
    binary += String.fromCharCode(...bytes.subarray(i, i + BASE64_CHUNK_SIZE));
  }
  return btoa(binary);
}

export class EncryptedRepository<T extends { id: string }> {
  private table: RowStore<EncryptedRecord>;

  constructor(table: RowStore<EncryptedRecord>) {
    this.table = table;
  }

  async put(record: T): Promise<void> {
    const mk = keystore.getMasterKey();
    const plaintext = new TextEncoder().encode(JSON.stringify(record));
    const { iv, ciphertext } = await encrypt(mk, plaintext);
    await this.table.put({
      id: record.id,
      iv: bufferToBase64(iv),
      ciphertext: bufferToBase64(ciphertext)
    });
  }

  async get(id: string): Promise<T | undefined> {
    const row = await this.table.get(id);
    if (!row) return undefined;
    return this.decryptRow(row);
  }

  async getAll(): Promise<T[]> {
    const rows = await this.table.toArray();
    return Promise.all(rows.map((row) => this.decryptRow(row)));
  }

  async delete(id: string): Promise<void> {
    await this.table.delete(id);
  }

  async count(): Promise<number> {
    return this.table.count();
  }

  private async decryptRow(row: EncryptedRecord): Promise<T> {
    const mk = keystore.getMasterKey();
    const iv = base64ToBuffer(row.iv);
    const ciphertext = base64ToBuffer(row.ciphertext);
    const plaintext = await decrypt(mk, iv, ciphertext);
    return JSON.parse(new TextDecoder().decode(plaintext)) as T;
  }
}
