import { describe, expect, it } from 'vitest';
import { getRequestPathname, getRequestSearch } from '../../src/Utils/Url';

/**
 * Builds a request that exposes a raw Node request target, the way srvx does
 * on the Node runtime.
 *
 * @param {string} target - The raw request target (`pathname + search`).
 * @returns {Request} The request to feed to the URL helpers.
 */
function nodeRequest(target: string): Request {
  const request = new Request(`http://localhost${target}`);
  Object.defineProperty(request, 'runtime', { value: { name: 'node', node: { req: { url: target } } } });

  return request;
}

describe('Url utilities', () => {
  describe('getRequestPathname', () => {
    it('should return the raw target pathname', () => {
      expect(getRequestPathname(nodeRequest('/api/users'))).toBe('/api/users');
      expect(getRequestPathname(nodeRequest('/api/users?page=2'))).toBe('/api/users');
    });

    it('should fall back to the request url when there is no raw target', () => {
      expect(getRequestPathname(new Request('http://localhost/api/users?page=2'))).toBe('/api/users');
    });

    it.each([
      ['/api/./users', '/api/users'],
      ['/api/../users', '/users'],
      ['/api/users/.', '/api/users/'],
      ['/api/users/..', '/api/'],
      ['/../users', '/users'],
      ['/api/%2e/users', '/api/users'],
      ['/api/%2e%2e/users', '/users'],
      ['/api/users', '/api/users'],
      ['/assets/app.min.js', '/assets/app.min.js'],
      ['/', '/'],
    ])('should resolve dot segments in %s', (target, expected) => {
      expect(getRequestPathname(nodeRequest(target))).toBe(expected);
    });

    it('should match what the URL parser produces', () => {
      for (const target of ['/api/./users', '/api/../users', '/api/users/.', '/api/users/..', '/a/b/../../c']) {
        expect(getRequestPathname(nodeRequest(target))).toBe(new URL(`http://localhost${target}`).pathname);
      }
    });
  });

  describe('getRequestSearch', () => {
    it('should return the search string of the raw target', () => {
      expect(getRequestSearch(nodeRequest('/api/users?page=2'))).toBe('?page=2');
      expect(getRequestSearch(nodeRequest('/api/users'))).toBe('');
    });

    it('should fall back to the request url when there is no raw target', () => {
      expect(getRequestSearch(new Request('http://localhost/api/users?page=2'))).toBe('?page=2');
    });
  });
});
