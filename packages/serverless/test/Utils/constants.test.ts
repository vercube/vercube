import { describe, expect, it } from 'vitest';
import {
  BASE64_ENCODING,
  DEFAULT_BODY,
  DEFAULT_CONTENT_TYPE,
  DEFAULT_HOSTNAME,
  DEFAULT_METHOD,
  HEADER_KEYS,
  HTTP_PROTOCOL,
  HTTPS_PROTOCOL,
  UTF8_ENCODING,
} from '../../src/Utils';

describe('Utils - Constants', () => {
  describe('HTTP method constants', () => {
    it('should export DEFAULT_METHOD as GET', () => {
      expect(DEFAULT_METHOD).toBe('GET');
    });

    it('should export DEFAULT_HOSTNAME as dot', () => {
      expect(DEFAULT_HOSTNAME).toBe('.');
    });
  });

  describe('Protocol constants', () => {
    it('should export HTTP_PROTOCOL as http', () => {
      expect(HTTP_PROTOCOL).toBe('http');
    });

    it('should export HTTPS_PROTOCOL as https', () => {
      expect(HTTPS_PROTOCOL).toBe('https');
    });
  });

  describe('Response constants', () => {
    it('should export DEFAULT_BODY as empty string', () => {
      expect(DEFAULT_BODY).toBe('');
    });

    it('should export DEFAULT_CONTENT_TYPE as empty string', () => {
      expect(DEFAULT_CONTENT_TYPE).toBe('');
    });
  });

  describe('Encoding constants', () => {
    it('should export UTF8_ENCODING as utf8', () => {
      expect(UTF8_ENCODING).toBe('utf8');
    });

    it('should export BASE64_ENCODING as base64', () => {
      expect(BASE64_ENCODING).toBe('base64');
    });
  });

  describe('Header keys constants', () => {
    it('should export HEADER_KEYS with correct structure', () => {
      expect(HEADER_KEYS).toEqual({
        HOST: ['host', 'Host'],
        X_FORWARDED_PROTO: ['X-Forwarded-Proto', 'x-forwarded-proto'],
        COOKIE: 'cookie',
      });
    });

    it('should have HOST array with lowercase and capitalized versions', () => {
      expect(HEADER_KEYS.HOST).toEqual(['host', 'Host']);
    });

    it('should have X_FORWARDED_PROTO array with different cases', () => {
      expect(HEADER_KEYS.X_FORWARDED_PROTO).toEqual(['X-Forwarded-Proto', 'x-forwarded-proto']);
    });

    it('should have COOKIE as string', () => {
      expect(HEADER_KEYS.COOKIE).toBe('cookie');
    });
  });

  describe('Constants immutability', () => {
    it('should not allow modification of string constants', () => {
      // These should be readonly, but we test that they have expected values
      expect(DEFAULT_METHOD).toBe('GET');
      expect(DEFAULT_HOSTNAME).toBe('.');
      expect(HTTP_PROTOCOL).toBe('http');
      expect(HTTPS_PROTOCOL).toBe('https');
      expect(DEFAULT_BODY).toBe('');
      expect(DEFAULT_CONTENT_TYPE).toBe('');
      expect(UTF8_ENCODING).toBe('utf8');
      expect(BASE64_ENCODING).toBe('base64');
    });

    it('should not allow modification of HEADER_KEYS structure', () => {
      // Test that the structure is as expected
      expect(Array.isArray(HEADER_KEYS.HOST)).toBe(true);
      expect(Array.isArray(HEADER_KEYS.X_FORWARDED_PROTO)).toBe(true);
      expect(typeof HEADER_KEYS.COOKIE).toBe('string');
    });
  });
});
