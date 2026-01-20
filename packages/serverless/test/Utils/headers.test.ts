import { describe, expect, it } from 'vitest';
import { getHeaderValue, headersToObject } from '../../src/Utils';
import type { LoopableHeader } from '../../src/Utils';

describe('Utils - Headers', () => {
  describe('headersToObject', () => {
    it('should convert headers with forEach to object', () => {
      const mockHeaders: LoopableHeader = {
        forEach: (callback: (value: string, key: string) => void) => {
          callback('application/json', 'content-type');
          callback('Bearer token123', 'authorization');
          callback('custom-value', 'x-custom-header');
        },
      };

      const result = headersToObject(mockHeaders);

      expect(result).toEqual({
        'content-type': 'application/json',
        authorization: 'Bearer token123',
        'x-custom-header': 'custom-value',
      });
    });

    it('should handle empty headers', () => {
      const mockHeaders: LoopableHeader = {
        // oxlint-disable-next-line no-unused-vars
        forEach: (callback: (value: string, key: string) => void) => {
          // No headers
        },
      };

      const result = headersToObject(mockHeaders);

      expect(result).toEqual({});
    });

    it('should handle headers with special characters', () => {
      const mockHeaders: LoopableHeader = {
        forEach: (callback: (value: string, key: string) => void) => {
          callback('value with spaces and symbols!@#$%', 'x-special-header');
          callback('value,with,commas', 'x-comma-header');
          callback('value\nwith\nnewlines', 'x-newline-header');
        },
      };

      const result = headersToObject(mockHeaders);

      expect(result).toEqual({
        'x-special-header': 'value with spaces and symbols!@#$%',
        'x-comma-header': 'value,with,commas',
        'x-newline-header': 'value\nwith\nnewlines',
      });
    });

    it('should handle headers with case variations', () => {
      const mockHeaders: LoopableHeader = {
        forEach: (callback: (value: string, key: string) => void) => {
          callback('application/json', 'Content-Type');
          callback('Bearer token', 'AUTHORIZATION');
          callback('custom-value', 'X-Custom-Header');
        },
      };

      const result = headersToObject(mockHeaders);

      expect(result).toEqual({
        'Content-Type': 'application/json',
        AUTHORIZATION: 'Bearer token',
        'X-Custom-Header': 'custom-value',
      });
    });

    it('should handle headers with empty values', () => {
      const mockHeaders: LoopableHeader = {
        forEach: (callback: (value: string, key: string) => void) => {
          callback('', 'empty-header');
          callback('valid-value', 'valid-header');
        },
      };

      const result = headersToObject(mockHeaders);

      expect(result).toEqual({
        'empty-header': '',
        'valid-header': 'valid-value',
      });
    });

    it('should handle headers with numeric values', () => {
      const mockHeaders: LoopableHeader = {
        forEach: (callback: (value: string, key: string) => void) => {
          callback('123', 'content-length');
          callback('3600', 'cache-control');
        },
      };

      const result = headersToObject(mockHeaders);

      expect(result).toEqual({
        'content-length': '123',
        'cache-control': '3600',
      });
    });

    it('should handle headers with duplicate keys (last one wins)', () => {
      const mockHeaders: LoopableHeader = {
        forEach: (callback: (value: string, key: string) => void) => {
          callback('first-value', 'duplicate-header');
          callback('second-value', 'duplicate-header');
          callback('third-value', 'duplicate-header');
        },
      };

      const result = headersToObject(mockHeaders);

      expect(result).toEqual({
        'duplicate-header': 'third-value',
      });
    });

    it('should handle headers with whitespace in keys and values', () => {
      const mockHeaders: LoopableHeader = {
        forEach: (callback: (value: string, key: string) => void) => {
          callback(' value with spaces ', ' header with spaces ');
          callback('trimmed-value', 'trimmed-header');
        },
      };

      const result = headersToObject(mockHeaders);

      expect(result).toEqual({
        ' header with spaces ': ' value with spaces ',
        'trimmed-header': 'trimmed-value',
      });
    });

    it('should handle headers with unicode characters', () => {
      const mockHeaders: LoopableHeader = {
        forEach: (callback: (value: string, key: string) => void) => {
          callback('café', 'x-unicode-value');
          callback('测试', 'x-chinese-header');
          callback('🚀', 'x-emoji-header');
        },
      };

      const result = headersToObject(mockHeaders);

      expect(result).toEqual({
        'x-unicode-value': 'café',
        'x-chinese-header': '测试',
        'x-emoji-header': '🚀',
      });
    });
  });

  describe('getHeaderValue', () => {
    it('should return header value for first matching key', () => {
      const headers = {
        'content-type': 'application/json',
        'Content-Type': 'text/html',
        'CONTENT-TYPE': 'text/plain',
      };

      const result = getHeaderValue(headers, ['content-type', 'Content-Type', 'CONTENT-TYPE']);

      expect(result).toBe('application/json');
    });

    it('should return header value for second matching key when first is not found', () => {
      const headers = {
        'Content-Type': 'text/html',
        'CONTENT-TYPE': 'text/plain',
      };

      const result = getHeaderValue(headers, ['content-type', 'Content-Type', 'CONTENT-TYPE']);

      expect(result).toBe('text/html');
    });

    it('should return undefined when no keys match', () => {
      const headers = {
        'content-type': 'application/json',
        authorization: 'Bearer token',
      };

      const result = getHeaderValue(headers, ['x-custom-header', 'x-another-header']);

      expect(result).toBeUndefined();
    });

    it('should return undefined for null headers', () => {
      const result = getHeaderValue(null, ['content-type']);

      expect(result).toBeUndefined();
    });

    it('should return undefined for undefined headers', () => {
      const result = getHeaderValue(undefined, ['content-type']);

      expect(result).toBeUndefined();
    });

    it('should return undefined for empty headers object', () => {
      const result = getHeaderValue({}, ['content-type']);

      expect(result).toBeUndefined();
    });

    it('should handle headers with undefined values', () => {
      const headers = {
        'content-type': undefined,
        authorization: 'Bearer token',
      };

      const result = getHeaderValue(headers, ['content-type', 'authorization']);

      expect(result).toBe('Bearer token');
    });

    it('should handle empty keys array', () => {
      const headers = {
        'content-type': 'application/json',
      };

      const result = getHeaderValue(headers, []);

      expect(result).toBeUndefined();
    });

    it('should handle single key', () => {
      const headers = {
        'content-type': 'application/json',
      };

      const result = getHeaderValue(headers, ['content-type']);

      expect(result).toBe('application/json');
    });

    it('should handle case-sensitive matching', () => {
      const headers = {
        'Content-Type': 'application/json',
        'content-type': 'text/html',
      };

      const result = getHeaderValue(headers, ['Content-Type']);

      expect(result).toBe('application/json');
    });

    it('should handle headers with special characters in keys', () => {
      const headers = {
        'x-custom-header': 'custom-value',
        'x-special@header': 'special-value',
        'x-header-with-dashes': 'dash-value',
      };

      const result1 = getHeaderValue(headers, ['x-custom-header']);
      const result2 = getHeaderValue(headers, ['x-special@header']);
      const result3 = getHeaderValue(headers, ['x-header-with-dashes']);

      expect(result1).toBe('custom-value');
      expect(result2).toBe('special-value');
      expect(result3).toBe('dash-value');
    });

    it('should handle headers with empty string values', () => {
      const headers = {
        'empty-header': '',
        'normal-header': 'normal-value',
      };

      const result1 = getHeaderValue(headers, ['empty-header']);
      const result2 = getHeaderValue(headers, ['normal-header']);

      expect(result1).toBe('');
      expect(result2).toBe('normal-value');
    });

    it('should handle headers with numeric string values', () => {
      const headers = {
        'content-length': '123',
        'status-code': '200',
      };

      const result1 = getHeaderValue(headers, ['content-length']);
      const result2 = getHeaderValue(headers, ['status-code']);

      expect(result1).toBe('123');
      expect(result2).toBe('200');
    });

    it('should handle headers with boolean string values', () => {
      const headers = {
        secure: 'true',
        'http-only': 'false',
      };

      const result1 = getHeaderValue(headers, ['secure']);
      const result2 = getHeaderValue(headers, ['http-only']);

      expect(result1).toBe('true');
      expect(result2).toBe('false');
    });
  });
});
