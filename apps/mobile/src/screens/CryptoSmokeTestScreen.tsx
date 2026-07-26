import { useEffect, useState } from 'react';
import { View, ScrollView, Text } from 'react-native';
import {
  generateSigningKeypair,
  generateWrappingKeypair,
  sign,
  verify,
  exportJwk,
  importSigningPrivateJwk,
  importSigningPublicJwk,
  importWrappingPrivateJwk,
  importWrappingPublicJwk,
  deriveSharedWrappingKey,
  wrapKey,
  unwrapKey,
  generateMasterKey,
  deriveKey,
  generateSalt,
  encrypt,
  decrypt
} from '@/core/crypto/engine';
import { deriveRecoveryKeypair, signRecoveryChallenge } from '@/core/identity/recovery';

/**
 * Scratch verification tool (Track C prerequisite) — NOT wired into real navigation permanently.
 * Exercises react-native-quick-crypto's actual on-device behavior for every primitive the claim/
 * signedFetch/recovery flow depends on, before porting that code. Temporarily swapped into
 * RootNavigator's stand-in slot, read via screenshot, then reverted once confirmed.
 */
export function CryptoSmokeTestScreen() {
  const [lines, setLines] = useState<string[]>(['Running…']);

  useEffect(() => {
    const out: string[] = [];
    const log = (s: string) => {
      out.push(s);
      setLines([...out]);
    };

    (async () => {
      try {
        log('crypto.randomUUID: ' + (typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : 'MISSING'));
      } catch (e) {
        log('crypto.randomUUID: THREW ' + String(e));
      }

      try {
        const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode('hello'));
        log('SHA-256 digest: OK (' + new Uint8Array(digest).length + ' bytes)');
      } catch (e) {
        log('SHA-256 digest: FAILED ' + String(e));
      }

      try {
        log('btoa: ' + (typeof btoa === 'function' ? 'present' : 'MISSING'));
        log('atob: ' + (typeof atob === 'function' ? 'present' : 'MISSING'));
      } catch (e) {
        log('btoa/atob check threw ' + String(e));
      }

      // ECDSA P-256 signing keypair: generate -> sign -> verify -> JWK round-trip
      try {
        const kp = await generateSigningKeypair(true);
        const data = new TextEncoder().encode('nonce\nGET\n/whoami\n' + 'a'.repeat(64));
        const sig = await sign(kp.privateKey, data);
        const sigBytes = new Uint8Array(sig).length;
        const ok = await verify(kp.publicKey, sig, data);
        log(`ECDSA P-256 sign/verify: ${ok ? 'OK' : 'FAILED verify'} (sig=${sigBytes} bytes, expect 64 for raw P1363)`);

        const privJwk = await exportJwk(kp.privateKey);
        const pubJwk = await exportJwk(kp.publicKey);
        const privImported = await importSigningPrivateJwk(privJwk, false);
        const pubImported = await importSigningPublicJwk(pubJwk, false);
        const sig2 = await sign(privImported, data);
        const ok2 = await verify(pubImported, sig2, data);
        log('ECDSA JWK export/import round-trip: ' + (ok2 ? 'OK' : 'FAILED'));
      } catch (e) {
        log('ECDSA P-256: THREW ' + String(e));
      }

      // ECDH P-256 wrapping keypair: generate on both "sides", derive shared KEK, wrap/unwrap
      try {
        const a = await generateWrappingKeypair(true);
        const b = await generateWrappingKeypair(true);
        const aPubJwk = await exportJwk(a.publicKey);
        const bPubJwk = await exportJwk(b.publicKey);
        const aPubImported = await importWrappingPublicJwk(aPubJwk, false);
        const bPubImported = await importWrappingPublicJwk(bPubJwk, false);
        const kekA = await deriveSharedWrappingKey(a.privateKey, bPubImported);
        const kekB = await deriveSharedWrappingKey(b.privateKey, aPubImported);
        const payloadKey = await generateMasterKey(true);
        const wrapped = await wrapKey(payloadKey, kekA);
        const unwrapped = await unwrapKey(wrapped, kekB, true);
        const rawOriginal = new Uint8Array(await crypto.subtle.exportKey('raw', payloadKey));
        const rawUnwrapped = new Uint8Array(await crypto.subtle.exportKey('raw', unwrapped));
        const match = rawOriginal.length === rawUnwrapped.length && rawOriginal.every((b, i) => b === rawUnwrapped[i]);
        log('ECDH derive + wrap/unwrap round-trip: ' + (match ? 'OK' : 'FAILED (bytes differ)'));

        const privJwk = await exportJwk(a.privateKey);
        await importWrappingPrivateJwk(privJwk, false);
        log('ECDH private JWK import: OK');
      } catch (e) {
        log('ECDH P-256: THREW ' + String(e));
      }

      // Ed25519 via manually-constructed PKCS#8 (the exact recovery.ts path)
      try {
        const salt = crypto.getRandomValues(new Uint8Array(16)).buffer as ArrayBuffer;
        const { publicJwk, privateKey } = await deriveRecoveryKeypair('test-passphrase-123', salt);
        log('Ed25519 deriveRecoveryKeypair (pkcs8 import): OK (crv=' + publicJwk.crv + ')');
        const sigB64 = await signRecoveryChallenge(privateKey, 'testuser', 'test-nonce');
        log('Ed25519 signRecoveryChallenge: OK (sig len=' + sigB64.length + ' base64 chars)');

        // Verify with a freshly-imported public key from the JWK, to confirm the public half is usable.
        const pubKey = await crypto.subtle.importKey('jwk', publicJwk, { name: 'Ed25519' }, false, ['verify']);
        const data = new TextEncoder().encode(['recover', 'testuser', 'test-nonce'].join('\n'));
        const sigBytes = Uint8Array.from(atob(sigB64), (c) => c.charCodeAt(0));
        const ok = await crypto.subtle.verify({ name: 'Ed25519' }, pubKey, sigBytes, data);
        log('Ed25519 verify with re-imported public JWK: ' + (ok ? 'OK' : 'FAILED'));
      } catch (e) {
        log('Ed25519: THREW ' + String(e));
      }

      // Does btoa/atob correctly round-trip arbitrary binary bytes (0-255), not just ASCII? This is
      // exactly what EncryptedRepository's bufferToBase64/base64ToBuffer do to store IV+ciphertext as
      // text in the native storage layer — if btoa/atob mishandle high bytes, ciphertext gets
      // silently corrupted and AES-GCM's tag check fails on decrypt ("Cipher.final failed", not a
      // helpful error).
      try {
        const bytes = new Uint8Array(256);
        for (let i = 0; i < 256; i++) bytes[i] = i;
        const b64 = btoa(String.fromCharCode(...bytes));
        const decoded = atob(b64);
        const roundTripped = new Uint8Array(decoded.length);
        for (let i = 0; i < decoded.length; i++) roundTripped[i] = decoded.charCodeAt(i);
        const match = roundTripped.length === bytes.length && bytes.every((b, i) => b === roundTripped[i]);
        log('btoa/atob round-trip all 256 byte values: ' + (match ? 'OK' : 'FAILED (corruption detected)'));
        if (!match) {
          const firstDiff = bytes.findIndex((b, i) => b !== roundTripped[i]);
          log(`  first mismatch at index ${firstDiff}: expected ${bytes[firstDiff]}, got ${roundTripped[firstDiff]}`);
        }
      } catch (e) {
        log('btoa/atob round-trip test: THREW ' + String(e));
      }

      // Exact sequence securityManager.initialize()/EncryptedRepository perform: PBKDF2-derived KEK ->
      // generate DMK -> wrap with KEK -> unwrap -> AES-GCM encrypt/decrypt a plaintext payload.
      try {
        const salt = generateSalt();
        const pinKek = await deriveKey('123456', salt, 200_000);
        log('PBKDF2 deriveKey (pinKek): OK');
        const dmk = await generateMasterKey(true);
        log('generateMasterKey: OK');
        const wrapped = await wrapKey(dmk, pinKek);
        log('wrapKey(dmk, pinKek): OK (' + wrapped.byteLength + ' bytes)');
        const unwrappedDmk = await unwrapKey(wrapped, pinKek, false);
        log('unwrapKey -> non-extractable DMK: OK');
        const plaintext = new TextEncoder().encode('hello penny');
        const { iv, ciphertext } = await encrypt(unwrappedDmk, plaintext);
        log('encrypt(dmk, plaintext): OK (' + ciphertext.byteLength + ' bytes)');
        const decrypted = await decrypt(unwrappedDmk, iv, ciphertext);
        const decryptedText = new TextDecoder().decode(decrypted);
        log('decrypt round-trip: ' + (decryptedText === 'hello penny' ? 'OK' : 'FAILED: ' + decryptedText));

        // Now the EXACT EncryptedRepository path: base64-encode iv+ciphertext (as if writing to the
        // native storage layer as text), then decode back before decrypting — this is what my first
        // isolated test skipped.
        const ivB64 = btoa(String.fromCharCode(...new Uint8Array(iv)));
        const ctB64 = btoa(String.fromCharCode(...new Uint8Array(ciphertext)));
        const ivBack = Uint8Array.from(atob(ivB64), (c) => c.charCodeAt(0)).buffer;
        const ctBack = Uint8Array.from(atob(ctB64), (c) => c.charCodeAt(0)).buffer;
        const decrypted2 = await decrypt(unwrappedDmk, ivBack, ctBack);
        const decryptedText2 = new TextDecoder().decode(decrypted2);
        log(
          'decrypt via base64 round-trip (EncryptedRepository path): ' +
            (decryptedText2 === 'hello penny' ? 'OK' : 'FAILED: ' + decryptedText2)
        );
      } catch (e) {
        log('DMK wrap/unwrap/encrypt/decrypt sequence: THREW ' + String(e));
      }

      log('DONE');
    })().catch((e) => log('UNCAUGHT: ' + String(e)));
  }, []);

  return (
    <View className="flex-1 bg-surface-tertiary pt-16 px-4">
      <Text className="text-lg font-bold text-primary mb-3">Crypto Smoke Test</Text>
      <ScrollView className="flex-1">
        {lines.map((l, i) => (
          <Text key={i} className="text-xs font-mono text-secondary mb-1">
            {l}
          </Text>
        ))}
      </ScrollView>
    </View>
  );
}
