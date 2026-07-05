import { describe, it, expect } from 'vitest';
import { deriveRecoveryKeypair, signRecoveryChallenge, buildRecoveryString } from '@/core/identity/recovery';

function base64ToBuffer(b64: string): ArrayBuffer {
  const bin = atob(b64);
  const buf = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
  return buf.buffer;
}

describe('passphrase recovery keypair (Track F, F3, scheme A)', () => {
  const salt = crypto.getRandomValues(new Uint8Array(16)).buffer;

  it('derives deterministically — same passphrase+salt → same public key', async () => {
    const a = await deriveRecoveryKeypair('correct horse battery staple', salt);
    const b = await deriveRecoveryKeypair('correct horse battery staple', salt);
    expect(a.publicJwk.x).toBe(b.publicJwk.x);
    expect(a.publicJwk.kty).toBe('OKP');
    expect(a.publicJwk.crv).toBe('Ed25519');
  });

  it('different passphrase → different public key', async () => {
    const a = await deriveRecoveryKeypair('passphrase one', salt);
    const b = await deriveRecoveryKeypair('passphrase two', salt);
    expect(a.publicJwk.x).not.toBe(b.publicJwk.x);
  });

  it('produces a signature the server-side verifier accepts', async () => {
    const { publicJwk, privateKey } = await deriveRecoveryKeypair('correct horse battery staple', salt);
    const sigB64 = await signRecoveryChallenge(privateKey, 'aarav_s', 'nonce-123');

    // Mirror the worker's verify (verifyRecoverySignature): import the public JWK + verify over the
    // exact buildRecoveryString bytes.
    const pub = await crypto.subtle.importKey('jwk', publicJwk, { name: 'Ed25519' }, false, ['verify']);
    const data = new TextEncoder().encode(buildRecoveryString('aarav_s', 'nonce-123'));
    const ok = await crypto.subtle.verify({ name: 'Ed25519' }, pub, base64ToBuffer(sigB64), data);
    expect(ok).toBe(true);
  });

  it('rejects a signature over a different nonce (replay/tamper)', async () => {
    const { publicJwk, privateKey } = await deriveRecoveryKeypair('correct horse battery staple', salt);
    const sigB64 = await signRecoveryChallenge(privateKey, 'aarav_s', 'nonce-123');
    const pub = await crypto.subtle.importKey('jwk', publicJwk, { name: 'Ed25519' }, false, ['verify']);
    const data = new TextEncoder().encode(buildRecoveryString('aarav_s', 'DIFFERENT-nonce'));
    const ok = await crypto.subtle.verify({ name: 'Ed25519' }, pub, base64ToBuffer(sigB64), data);
    expect(ok).toBe(false);
  });
});
