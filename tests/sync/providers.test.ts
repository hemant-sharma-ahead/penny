import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { googleDriveProvider } from '@/core/sync/providers/googleDriveProvider';
import { icloudProvider } from '@/core/sync/providers/icloudProvider';
import { QuotaExceededError } from '@/core/sync/providers/types';

beforeEach(() => vi.stubEnv('VITE_GOOGLE_CLIENT_ID', 'test-client.apps.googleusercontent.com'));

// The Drive provider reads window.google (GIS). Node has no window, so stub it; providing
// accounts.oauth2 makes loadGis() resolve immediately (never touching document).
function stubGis(token = 'tok') {
  vi.stubGlobal('window', {
    google: {
      accounts: {
        oauth2: {
          initTokenClient: ({ callback }: { callback: (r: { access_token?: string }) => void }) => ({
            requestAccessToken: () => callback({ access_token: token })
          })
        }
      }
    }
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe('googleDriveProvider', () => {
  it('parses headRevisionId as the change tag from a files.list response', async () => {
    stubGis();
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(JSON.stringify({ files: [{ id: 'f1', headRevisionId: 'rev-9', modifiedTime: 't' }] }), {
            status: 200
          })
      )
    );
    expect(await googleDriveProvider.remoteTag()).toBe('rev-9');
  });

  it('maps a 403 storageQuotaExceeded upload into QuotaExceededError', async () => {
    stubGis();
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
        const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
        if (url.includes('/upload/')) {
          return new Response(JSON.stringify({ error: { errors: [{ reason: 'storageQuotaExceeded' }] } }), {
            status: 403
          });
        }
        return new Response(JSON.stringify({ files: [{ id: 'f1', headRevisionId: 'r' }] }), { status: 200 });
      })
    );
    await expect(googleDriveProvider.push(new Blob(['x']))).rejects.toBeInstanceOf(QuotaExceededError);
  });

  it('reports needs_consent when a silent token is refused', async () => {
    vi.stubGlobal('window', {
      google: {
        accounts: {
          oauth2: {
            initTokenClient: ({ error_callback }: { error_callback: () => void }) => ({
              requestAccessToken: () => error_callback()
            })
          }
        }
      }
    });
    expect(await googleDriveProvider.ensureConnected(false)).toBe('needs_consent');
  });
});

describe('icloudProvider', () => {
  it('is unavailable on the web (no native bridge)', () => {
    expect(icloudProvider.isAvailable()).toBe(false);
  });
});
