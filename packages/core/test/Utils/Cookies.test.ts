import { describe, expect, it } from 'vitest';
import { deleteCookie, getSetCookieName, parseCookie, parseCookies, parseSetCookie, serializeCookie, setCookie } from '../../src';

describe('parseCookies', () => {
  it('returns an empty object without a header', () => {
    expect(parseCookies(null)).toEqual({});
    expect(parseCookies(undefined)).toEqual({});
    expect(parseCookies('')).toEqual({});
  });

  it('reads every pair', () => {
    expect(parseCookies('a=1; b=2;c=3')).toEqual({ a: '1', b: '2', c: '3' });
  });

  it('keeps `=` inside a value', () => {
    expect(parseCookies('token=abc==; x=1')).toEqual({ token: 'abc==', x: '1' });
  });

  it('decodes percent-encoding and leaves a broken sequence alone', () => {
    expect(parseCookies('a=hello%20world; b=100%; c=%E0%A4%A')).toEqual({ a: 'hello world', b: '100%', c: '%E0%A4%A' });
  });

  it('strips quotes and whitespace around a value', () => {
    expect(parseCookies('a="quoted";  b =  spaced  ')).toEqual({ a: 'quoted', b: 'spaced' });
  });

  it('keeps the first of a repeated name', () => {
    expect(parseCookies('a=first; a=second')).toEqual({ a: 'first' });
  });

  it('skips pairs without a name or without `=`', () => {
    expect(parseCookies('flag; =orphan; a=1;;')).toEqual({ a: '1' });
  });

  it('keeps an empty value', () => {
    expect(parseCookies('a=; b=1')).toEqual({ a: '', b: '1' });
  });

  it('is not fooled by prototype names', () => {
    const cookies = parseCookies('__proto__=x; constructor=y; toString=z');

    expect(cookies['__proto__']).toBe('x');
    expect(cookies['constructor']).toBe('y');
    expect(cookies['toString']).toBe('z');
    expect(parseCookies('a=1')['constructor']).toBeUndefined();
  });
});

describe('parseCookie', () => {
  it('reads one cookie by name', () => {
    expect(parseCookie('a=1; session=abc%3D; b=2', 'session')).toBe('abc=');
  });

  it('matches the whole name only', () => {
    expect(parseCookie('xsession=1; session2=2', 'session')).toBeUndefined();
    expect(parseCookie('a=session=1', 'session')).toBeUndefined();
  });

  it('returns undefined without a header, a name or a match', () => {
    expect(parseCookie(null, 'a')).toBeUndefined();
    expect(parseCookie('a=1', '')).toBeUndefined();
    expect(parseCookie('a=1', 'b')).toBeUndefined();
  });

  it('agrees with parseCookies on a repeated name', () => {
    expect(parseCookie('a=first; a=second', 'a')).toBe('first');
  });
});

describe('serializeCookie', () => {
  it('defaults the path to the whole site', () => {
    expect(serializeCookie('a', '1')).toBe('a=1; Path=/');
  });

  it('encodes the value', () => {
    expect(serializeCookie('a', 'x; y=ż')).toBe(`a=${encodeURIComponent('x; y=ż')}; Path=/`);
  });

  it('writes every attribute', () => {
    expect(
      serializeCookie('sid', 'v', {
        path: '/app',
        domain: 'example.com',
        maxAge: 60.9,
        expires: new Date(Date.UTC(2030, 0, 1)),
        httpOnly: true,
        secure: true,
        sameSite: 'lax',
        partitioned: true,
        priority: 'high',
      }),
    ).toBe(
      'sid=v; Path=/app; Domain=example.com; Max-Age=60; Expires=Tue, 01 Jan 2030 00:00:00 GMT; HttpOnly; Secure; SameSite=Lax; Partitioned; Priority=High',
    );
  });

  it('adds Secure where the browser requires it', () => {
    expect(serializeCookie('a', '1', { sameSite: 'none' })).toBe('a=1; Path=/; Secure; SameSite=None');
    expect(serializeCookie('a', '1', { partitioned: true })).toBe('a=1; Path=/; Secure; Partitioned');
  });

  it('rejects what would break out of the header', () => {
    expect(() => serializeCookie('a b', '1')).toThrow(TypeError);
    expect(() => serializeCookie('a=b', '1')).toThrow(TypeError);
    expect(() => serializeCookie('', '1')).toThrow(TypeError);
    expect(() => serializeCookie('a', '1', { path: '/; Domain=evil.com' })).toThrow(TypeError);
    expect(() => serializeCookie('a', '1', { domain: 'x\r\nSet-Cookie: b=1' })).toThrow(TypeError);
    expect(() => serializeCookie('a', '1', { maxAge: Number.NaN })).toThrow(TypeError);
    expect(() => serializeCookie('a', '1', { expires: new Date('nope') })).toThrow(TypeError);
    expect(() => serializeCookie('a', '1', { sameSite: 'bogus' as never })).toThrow(TypeError);
    expect(() => serializeCookie('a', '1', { priority: 'bogus' as never })).toThrow(TypeError);
  });
});

describe('setCookie and deleteCookie', () => {
  it('appends without touching other cookies', () => {
    const response = new Response(null, { headers: { 'set-cookie': 'other=1; Path=/' } });

    setCookie(response, 'a', '1', { httpOnly: true });

    expect(response.headers.getSetCookie()).toEqual(['other=1; Path=/', 'a=1; Path=/; HttpOnly']);
  });

  it('replaces a cookie of the same name', () => {
    const headers = new Headers();

    setCookie(headers, 'a', '1');
    setCookie(headers, 'b', '2');
    setCookie(headers, 'a', '3');

    expect(headers.getSetCookie()).toEqual(['b=2; Path=/', 'a=3; Path=/']);
  });

  it('deletes with an expiry in the past', () => {
    const headers = new Headers();

    deleteCookie(headers, 'a', { path: '/app' });

    expect(headers.getSetCookie()).toEqual(['a=; Path=/app; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT']);
  });
});

describe('parseSetCookie', () => {
  it('reads the cookie and its attributes', () => {
    expect(parseSetCookie('SessionID=abc==; Path=/; Secure; HttpOnly; SameSite=lax; Domain=example.com; Max-Age=3600')).toEqual({
      name: 'SessionID',
      value: 'abc==',
      path: '/',
      sameSite: 'Lax',
      secure: true,
      httpOnly: true,
      domain: 'example.com',
      expires: undefined,
      maxAge: 3600,
    });
  });

  it('reads back what serializeCookie wrote', () => {
    const parsed = parseSetCookie(serializeCookie('a', 'x y', { sameSite: 'strict', maxAge: 5 }));

    expect(parsed).toMatchObject({ name: 'a', value: 'x%20y', path: '/', sameSite: 'Strict', maxAge: 5 });
  });

  it('throws without a name and value', () => {
    expect(() => parseSetCookie('')).toThrow('non-empty string');
    expect(() => parseSetCookie('; Path=/')).toThrow('name and value');
  });

  it('ignores an unknown SameSite', () => {
    expect(parseSetCookie('a=1; SameSite=bogus').sameSite).toBeUndefined();
  });
});

describe('getSetCookieName', () => {
  it('reads the name', () => {
    expect(getSetCookieName(' session=abc; HttpOnly')).toBe('session');
    expect(getSetCookieName('flag')).toBe('flag');
  });
});
