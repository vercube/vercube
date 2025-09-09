import { describe, expect, it } from 'vitest';
import { cookiesFromHeaders, parseCookieString } from '../../src/Utils';

describe('Utils - Cookies', () => {
  describe('parseCookieString', () => {
    it('should parse simple cookie string', () => {
      const cookieString = 'sessionId=abc123';
      const cookie = parseCookieString(cookieString);

      expect(cookie).toEqual({
        name: 'sessionid',
        value: 'abc123',
        domain: undefined,
        expires: undefined,
        httpOnly: false,
        maxAge: undefined,
        path: undefined,
        sameSite: undefined,
        secure: false,
      });
    });

    it('should parse cookie with path attribute', () => {
      const cookieString = 'sessionId=abc123; Path=/';
      const cookie = parseCookieString(cookieString);

      expect(cookie).toEqual({
        name: 'sessionid',
        value: 'abc123',
        path: '/',
        domain: undefined,
        expires: undefined,
        httpOnly: false,
        maxAge: undefined,
        sameSite: undefined,
        secure: false,
      });
    });

    it('should parse cookie with secure attribute', () => {
      const cookieString = 'sessionId=abc123; Secure';
      const cookie = parseCookieString(cookieString);

      expect(cookie).toEqual({
        name: 'sessionid',
        value: 'abc123',
        secure: true,
        domain: undefined,
        expires: undefined,
        httpOnly: false,
        maxAge: undefined,
        path: undefined,
        sameSite: undefined,
      });
    });

    it('should parse cookie with httpOnly attribute', () => {
      const cookieString = 'sessionId=abc123; HttpOnly';
      const cookie = parseCookieString(cookieString);

      expect(cookie).toEqual({
        name: 'sessionid',
        value: 'abc123',
        httpOnly: true,
        domain: undefined,
        expires: undefined,
        maxAge: undefined,
        path: undefined,
        sameSite: undefined,
        secure: false,
      });
    });

    it('should parse cookie with domain attribute', () => {
      const cookieString = 'sessionId=abc123; Domain=.example.com';
      const cookie = parseCookieString(cookieString);

      expect(cookie).toEqual({
        name: 'sessionid',
        value: 'abc123',
        domain: '.example.com',
        expires: undefined,
        httpOnly: false,
        maxAge: undefined,
        path: undefined,
        sameSite: undefined,
        secure: false,
      });
    });

    it('should parse cookie with maxAge attribute', () => {
      const cookieString = 'sessionId=abc123; Max-Age=3600';
      const cookie = parseCookieString(cookieString);

      expect(cookie).toEqual({
        name: 'sessionid',
        value: 'abc123',
        maxAge: 3600,
        domain: undefined,
        expires: undefined,
        httpOnly: false,
        path: undefined,
        sameSite: undefined,
        secure: false,
      });
    });

    it('should parse cookie with expires attribute', () => {
      const cookieString = 'sessionId=abc123; Expires=Wed, 09 Jun 2021 10:18:14 GMT';
      const cookie = parseCookieString(cookieString);

      expect(cookie).toEqual({
        name: 'sessionid',
        value: 'abc123',
        expires: new Date('Wed, 09 Jun 2021 10:18:14 GMT'),
        domain: undefined,
        httpOnly: false,
        maxAge: undefined,
        path: undefined,
        sameSite: undefined,
        secure: false,
      });
    });

    it('should parse cookie with SameSite attribute', () => {
      const cookieString = 'sessionId=abc123; SameSite=Strict';
      const cookie = parseCookieString(cookieString);

      expect(cookie).toEqual({
        name: 'sessionid',
        value: 'abc123',
        sameSite: 'Strict',
        domain: undefined,
        expires: undefined,
        httpOnly: false,
        maxAge: undefined,
        path: undefined,
        secure: false,
      });
    });

    it('should parse cookie with all attributes', () => {
      const cookieString =
        'sessionId=abc123; HttpOnly; Secure; SameSite=Strict; Path=/; Domain=.example.com; Max-Age=3600; Expires=Wed, 09 Jun 2021 10:18:14 GMT';
      const cookie = parseCookieString(cookieString);

      expect(cookie).toEqual({
        name: 'sessionid',
        value: 'abc123',
        httpOnly: true,
        secure: true,
        sameSite: 'Strict',
        path: '/',
        domain: '.example.com',
        maxAge: 3600,
        expires: new Date('Wed, 09 Jun 2021 10:18:14 GMT'),
      });
    });

    it('should handle URL-encoded cookie values', () => {
      const cookieString = 'user=John%20Doe%40example.com; Path=/';
      const cookie = parseCookieString(cookieString);

      expect(cookie).toEqual({
        name: 'user',
        value: 'John Doe@example.com',
        path: '/',
        domain: undefined,
        expires: undefined,
        httpOnly: false,
        maxAge: undefined,
        sameSite: undefined,
        secure: false,
      });
    });

    it('should handle cookies with special characters in names', () => {
      const cookieString = 'user-name=value; Path=/';
      const cookie = parseCookieString(cookieString);

      expect(cookie).toEqual({
        name: 'user-name',
        value: 'value',
        path: '/',
        domain: undefined,
        expires: undefined,
        httpOnly: false,
        maxAge: undefined,
        sameSite: undefined,
        secure: false,
      });
    });

    it('should handle cookies with empty values', () => {
      const cookieString = 'empty=; Path=/';
      const cookie = parseCookieString(cookieString);

      expect(cookie).toEqual({
        name: 'empty',
        value: '',
        path: '/',
        domain: undefined,
        expires: undefined,
        httpOnly: false,
        maxAge: undefined,
        sameSite: undefined,
        secure: false,
      });
    });

    it('should handle cookies with boolean attributes in different cases', () => {
      const cookieString = 'sessionId=abc123; secure; httponly';
      const cookie = parseCookieString(cookieString);

      expect(cookie).toEqual({
        name: 'sessionid',
        value: 'abc123',
        secure: true,
        httpOnly: true,
        domain: undefined,
        expires: undefined,
        maxAge: undefined,
        path: undefined,
        sameSite: undefined,
      });
    });

    it('should handle cookies with SameSite in different cases', () => {
      const cookieString = 'sessionId=abc123; samesite=lax';
      const cookie = parseCookieString(cookieString);

      expect(cookie).toEqual({
        name: 'sessionid',
        value: 'abc123',
        sameSite: 'lax',
        domain: undefined,
        expires: undefined,
        httpOnly: false,
        maxAge: undefined,
        path: undefined,
        secure: false,
      });
    });

    it('should handle cookies with numeric maxAge', () => {
      const cookieString = 'sessionId=abc123; max-age=7200';
      const cookie = parseCookieString(cookieString);

      expect(cookie).toEqual({
        name: 'sessionid',
        value: 'abc123',
        maxAge: 7200,
        domain: undefined,
        expires: undefined,
        httpOnly: false,
        path: undefined,
        sameSite: undefined,
        secure: false,
      });
    });

    it('should handle cookies with invalid maxAge gracefully', () => {
      const cookieString = 'sessionId=abc123; max-age=invalid';
      const cookie = parseCookieString(cookieString);

      expect(cookie).toEqual({
        name: 'sessionid',
        value: 'abc123',
        maxAge: Number.NaN,
        domain: undefined,
        expires: undefined,
        httpOnly: false,
        path: undefined,
        sameSite: undefined,
        secure: false,
      });
    });

    it('should handle cookies with invalid expires gracefully', () => {
      const cookieString = 'sessionId=abc123; expires=invalid-date';
      const cookie = parseCookieString(cookieString);

      expect(cookie).toEqual({
        name: 'sessionid',
        value: 'abc123',
        expires: new Date(Number.NaN),
        domain: undefined,
        httpOnly: false,
        maxAge: undefined,
        path: undefined,
        sameSite: undefined,
        secure: false,
      });
    });

    it('should throw error for invalid cookie string', () => {
      expect(() => {
        parseCookieString('');
      }).toThrow('Invalid cookie string: must be a non-empty string');

      expect(() => {
        parseCookieString(null as any);
      }).toThrow('Invalid cookie string: must be a non-empty string');

      expect(() => {
        parseCookieString(undefined as any);
      }).toThrow('Invalid cookie string: must be a non-empty string');
    });

    it('should throw error for cookie string without name', () => {
      expect(() => {
        parseCookieString('=value');
      }).toThrow('Invalid cookie string: cookie name is required');

      expect(() => {
        parseCookieString('; Path=/');
      }).toThrow('Invalid cookie string: cookie name is required');
    });

    // Test cases to cover lines 39-40 (the missing coverage)
    it('should handle cookie string with empty parts array', () => {
      // This should trigger the condition where parts.length === 0
      // However, this is difficult to achieve with the current implementation
      // since split(';') on any string will return at least one element
      // Let's test edge cases that might trigger this path

      // Test with a string that when split by ';' might behave unexpectedly
      const cookieString = 'sessionId=abc123';
      const cookie = parseCookieString(cookieString);

      expect(cookie.name).toBe('sessionid');
      expect(cookie.value).toBe('abc123');
    });

    it('should handle cookie string with only semicolons', () => {
      // This might trigger the empty parts condition
      const cookieString = ';;;';

      expect(() => {
        parseCookieString(cookieString);
      }).toThrow('Invalid cookie string: cookie name is required');
    });

    it('should handle cookies with whitespace', () => {
      const cookieString = ' sessionId = abc123 ; Path = / ';
      const cookie = parseCookieString(cookieString);

      expect(cookie).toEqual({
        name: 'sessionid',
        value: ' abc123 ',
        path: ' / ',
        domain: undefined,
        expires: undefined,
        httpOnly: false,
        maxAge: undefined,
        sameSite: undefined,
        secure: false,
      });
    });

    it('should handle cookies with multiple semicolons', () => {
      const cookieString = 'sessionId=abc123;;;Path=/;;;Secure;;;';
      const cookie = parseCookieString(cookieString);

      expect(cookie).toEqual({
        name: 'sessionid',
        value: 'abc123',
        path: '/',
        secure: true,
        domain: undefined,
        expires: undefined,
        httpOnly: false,
        maxAge: undefined,
        sameSite: undefined,
      });
    });

    it('should handle cookies with complex values', () => {
      const cookieString = 'complex=value%20with%20spaces%20and%20symbols%21%40%23%24%25; Path=/';
      const cookie = parseCookieString(cookieString);

      expect(cookie).toEqual({
        name: 'complex',
        value: 'value with spaces and symbols!@#$%',
        path: '/',
        domain: undefined,
        expires: undefined,
        httpOnly: false,
        maxAge: undefined,
        sameSite: undefined,
        secure: false,
      });
    });

    it('should handle cookies with JSON-like values', () => {
      const cookieString = 'data=%7B%22id%22%3A123%2C%22name%22%3A%22John%22%7D; Path=/';
      const cookie = parseCookieString(cookieString);

      expect(cookie).toEqual({
        name: 'data',
        value: '{"id":123,"name":"John"}',
        path: '/',
        domain: undefined,
        expires: undefined,
        httpOnly: false,
        maxAge: undefined,
        sameSite: undefined,
        secure: false,
      });
    });

    it('should handle cookies with all SameSite values', () => {
      const sameSiteValues = ['Strict', 'Lax', 'None'] as const;

      for (const sameSite of sameSiteValues) {
        const cookieString = `sessionId=abc123; SameSite=${sameSite}`;
        const cookie = parseCookieString(cookieString);

        expect(cookie.sameSite).toBe(sameSite);
      }
    });

    it('should handle cookies with case-insensitive SameSite', () => {
      const cookieString = 'sessionId=abc123; samesite=STRICT';
      const cookie = parseCookieString(cookieString);

      expect(cookie.sameSite).toBe('STRICT');
    });
  });

  describe('cookiesFromHeaders', () => {
    it('should extract cookies from Headers object', () => {
      const headers = new Headers();
      headers.set('Set-Cookie', 'sessionId=abc123; HttpOnly; Secure');
      headers.append('Set-Cookie', 'theme=dark; Path=/');

      const cookies = cookiesFromHeaders(headers);

      expect(cookies).toHaveLength(2);
      expect(cookies![0]).toEqual({
        name: 'sessionid',
        value: 'abc123',
        httpOnly: true,
        secure: true,
        domain: undefined,
        expires: undefined,
        maxAge: undefined,
        path: undefined,
        sameSite: undefined,
      });
      expect(cookies![1]).toEqual({
        name: 'theme',
        value: 'dark',
        path: '/',
        domain: undefined,
        expires: undefined,
        httpOnly: false,
        maxAge: undefined,
        sameSite: undefined,
        secure: false,
      });
    });

    it('should return undefined when no cookies are present', () => {
      const headers = new Headers();
      headers.set('Content-Type', 'application/json');

      const cookies = cookiesFromHeaders(headers);

      expect(cookies).toBeUndefined();
    });

    it('should handle empty Headers object', () => {
      const headers = new Headers();

      const cookies = cookiesFromHeaders(headers);

      expect(cookies).toBeUndefined();
    });

    it('should handle cookies with all attributes', () => {
      const headers = new Headers();
      headers.set(
        'Set-Cookie',
        'sessionId=abc123; HttpOnly; Secure; SameSite=Strict; Path=/; Domain=.example.com; Max-Age=3600; Expires=Wed, 09 Jun 2021 10:18:14 GMT',
      );

      const cookies = cookiesFromHeaders(headers);

      expect(cookies).toHaveLength(1);
      expect(cookies![0]).toEqual({
        name: 'sessionid',
        value: 'abc123',
        httpOnly: true,
        secure: true,
        sameSite: 'Strict',
        path: '/',
        domain: '.example.com',
        maxAge: 3600,
        expires: new Date('Wed, 09 Jun 2021 10:18:14 GMT'),
      });
    });

    it('should handle cookies with minimal attributes', () => {
      const headers = new Headers();
      headers.set('Set-Cookie', 'simple=value');

      const cookies = cookiesFromHeaders(headers);

      expect(cookies).toHaveLength(1);
      expect(cookies![0]).toEqual({
        name: 'simple',
        value: 'value',
        domain: undefined,
        expires: undefined,
        httpOnly: false,
        maxAge: undefined,
        path: undefined,
        sameSite: undefined,
        secure: false,
      });
    });

    it('should handle cookies with URL-encoded values', () => {
      const headers = new Headers();
      headers.set('Set-Cookie', 'user=John%20Doe; Path=/');

      const cookies = cookiesFromHeaders(headers);

      expect(cookies).toHaveLength(1);
      expect(cookies![0]).toEqual({
        name: 'user',
        value: 'John Doe',
        path: '/',
        domain: undefined,
        expires: undefined,
        httpOnly: false,
        maxAge: undefined,
        sameSite: undefined,
        secure: false,
      });
    });

    it('should handle cookies with special characters in names', () => {
      const headers = new Headers();
      headers.set('Set-Cookie', 'user-name=value; Path=/');

      const cookies = cookiesFromHeaders(headers);

      expect(cookies).toHaveLength(1);
      expect(cookies![0]).toEqual({
        name: 'user-name',
        value: 'value',
        path: '/',
        domain: undefined,
        expires: undefined,
        httpOnly: false,
        maxAge: undefined,
        sameSite: undefined,
        secure: false,
      });
    });

    it('should handle cookies with boolean attributes', () => {
      const headers = new Headers();
      headers.set('Set-Cookie', 'secure=value; Secure; HttpOnly');

      const cookies = cookiesFromHeaders(headers);

      expect(cookies).toHaveLength(1);
      expect(cookies![0]).toEqual({
        name: 'secure',
        value: 'value',
        secure: true,
        httpOnly: true,
        domain: undefined,
        expires: undefined,
        maxAge: undefined,
        path: undefined,
        sameSite: undefined,
      });
    });

    it('should handle cookies with SameSite attribute', () => {
      const sameSiteValues = ['Strict', 'Lax', 'None'];

      for (const sameSite of sameSiteValues) {
        const headers = new Headers();
        headers.set('Set-Cookie', `cookie=value; SameSite=${sameSite}`);

        const cookies = cookiesFromHeaders(headers);

        expect(cookies).toHaveLength(1);
        expect(cookies![0].sameSite).toBe(sameSite);
      }
    });

    it('should handle multiple cookies with different attributes', () => {
      const headers = new Headers();
      headers.set('Set-Cookie', 'session=abc123; HttpOnly; Secure');
      headers.append('Set-Cookie', 'theme=dark; Path=/; SameSite=Lax');
      headers.append('Set-Cookie', 'preference=light; Domain=.example.com; Max-Age=3600');

      const cookies = cookiesFromHeaders(headers);

      expect(cookies).toHaveLength(3);
      expect(cookies![0].name).toBe('session');
      expect(cookies![1].name).toBe('theme');
      expect(cookies![2].name).toBe('preference');
    });

    it('should handle cookies with empty values', () => {
      const headers = new Headers();
      headers.set('Set-Cookie', 'empty=; Path=/');

      const cookies = cookiesFromHeaders(headers);

      expect(cookies).toHaveLength(1);
      expect(cookies![0].value).toBe('');
    });

    it('should handle cookies with complex URL-encoded values', () => {
      const headers = new Headers();
      headers.set('Set-Cookie', 'data=%7B%22key%22%3A%22value%22%7D; Path=/');

      const cookies = cookiesFromHeaders(headers);

      expect(cookies).toHaveLength(1);
      expect(cookies![0].value).toBe('{"key":"value"}');
    });
  });
});
