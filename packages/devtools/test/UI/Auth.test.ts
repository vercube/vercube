import { describe, expect, it } from 'vitest';
import { AUTH_STORAGE_KEY, emptyAuth, hasCredentials, loadAuth, persistAuth, toCredentials } from '../../ui/src/playground/auth';
import { MemoryStorage } from './Storage';

describe('toCredentials', () => {
  it('adds nothing until a value is entered', () => {
    for (const kind of ['none', 'bearer', 'basic', 'apikey'] as const) {
      expect(toCredentials({ ...emptyAuth(), kind })).toEqual({ headers: [] });
      expect(hasCredentials({ ...emptyAuth(), kind })).toBe(false);
    }
  });

  it('writes a bearer token', () => {
    expect(toCredentials({ ...emptyAuth(), kind: 'bearer', token: 'abc' }).headers).toEqual([
      { name: 'Authorization', value: 'Bearer abc' },
    ]);
  });

  it('writes basic credentials as UTF-8', () => {
    expect(toCredentials({ ...emptyAuth(), kind: 'basic', username: 'ada', password: 'pw' }).headers).toEqual([
      { name: 'Authorization', value: 'Basic YWRhOnB3' },
    ]);
    expect(toCredentials({ ...emptyAuth(), kind: 'basic', username: 'zoë', password: '' }).headers[0].value).toBe(
      `Basic ${Buffer.from('zoë:', 'utf8').toString('base64')}`,
    );
  });

  it('writes an API key under the chosen header', () => {
    const auth = { ...emptyAuth(), kind: 'apikey' as const, keyName: ' x-client-id ', keyValue: 'k1' };

    expect(toCredentials(auth).headers).toEqual([{ name: 'x-client-id', value: 'k1' }]);
    expect(toCredentials({ ...auth, keyName: ' ' }).headers).toEqual([]);
    expect(hasCredentials(auth)).toBe(true);
  });

  it('offers no cookie: every credential is a request header', () => {
    expect(Object.keys(emptyAuth())).not.toContain('cookieName');
    expect(Object.keys(toCredentials({ ...emptyAuth(), kind: 'bearer', token: 'abc' }))).toEqual(['headers']);
  });

  it('applies only the selected kind', () => {
    expect(toCredentials({ ...emptyAuth(), kind: 'none', token: 'abc', keyValue: 'k1' })).toEqual({ headers: [] });
  });
});

describe('persistAuth and loadAuth', () => {
  it('keeps nothing unless asked to', () => {
    const storage = new MemoryStorage();

    persistAuth(storage, { ...emptyAuth(), kind: 'bearer', token: 'abc' });

    expect(storage.getItem(AUTH_STORAGE_KEY)).toBeNull();
    expect(loadAuth(storage)).toEqual(emptyAuth());
  });

  it('keeps and restores the credentials when asked to', () => {
    const storage = new MemoryStorage();
    const auth = { ...emptyAuth(), kind: 'bearer' as const, token: 'abc', remember: true };

    persistAuth(storage, auth);

    expect(loadAuth(storage)).toEqual(auth);
  });

  it('removes what was kept once the box is unticked', () => {
    const storage = new MemoryStorage();

    persistAuth(storage, { ...emptyAuth(), kind: 'bearer', token: 'abc', remember: true });
    persistAuth(storage, { ...emptyAuth(), kind: 'bearer', token: 'abc', remember: false });

    expect(storage.getItem(AUTH_STORAGE_KEY)).toBeNull();
  });

  it('ignores stored values that are not credentials', () => {
    const storage = new MemoryStorage();

    storage.setItem(AUTH_STORAGE_KEY, '{nope');
    expect(loadAuth(storage)).toEqual(emptyAuth());

    storage.setItem(AUTH_STORAGE_KEY, '"text"');
    expect(loadAuth(storage)).toEqual(emptyAuth());

    storage.setItem(AUTH_STORAGE_KEY, JSON.stringify({ kind: 'oauth', token: 12, keyValue: 'k1' }));
    expect(loadAuth(storage)).toEqual({ ...emptyAuth(), keyValue: 'k1', remember: true });
  });

  it('drops a cookie credential an earlier version stored', () => {
    const storage = new MemoryStorage();

    storage.setItem(AUTH_STORAGE_KEY, JSON.stringify({ kind: 'cookie', cookieName: 'sid', cookieValue: 's1', remember: true }));

    const loaded = loadAuth(storage);

    expect(loaded).toEqual({ ...emptyAuth(), remember: true });

    persistAuth(storage, loaded);

    expect(storage.getItem(AUTH_STORAGE_KEY)).not.toContain('s1');
  });

  it('works without storage and with storage that throws', () => {
    const broken = new MemoryStorage();

    broken.fail = true;

    expect(loadAuth(null)).toEqual(emptyAuth());
    expect(loadAuth(broken)).toEqual(emptyAuth());
    expect(() => persistAuth(null, { ...emptyAuth(), remember: true })).not.toThrow();
    expect(() => persistAuth(broken, { ...emptyAuth(), remember: true })).not.toThrow();
  });
});
