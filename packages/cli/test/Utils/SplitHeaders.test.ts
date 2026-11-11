import { describe, expect, it } from 'vitest';
import { splitHeaders } from '../../src/Utils/SplitHeaders';

describe('splitHeaders', () => {
  it('returns an empty list for no value', () => {
    expect(splitHeaders(undefined)).toEqual([]);
    expect(splitHeaders('')).toEqual([]);
  });

  it('keeps a single header with commas in its value intact', () => {
    expect(splitHeaders('Accept: text/html, application/json')).toEqual(['Accept: text/html, application/json']);
  });

  it('splits multiple headers on commas followed by a header name', () => {
    expect(splitHeaders('Accept: text/html, application/json, Cache-Control: no-cache, no-store')).toEqual([
      'Accept: text/html, application/json',
      'Cache-Control: no-cache, no-store',
    ]);
  });

  it('keeps the legacy comma form working', () => {
    expect(splitHeaders('X-A: 1,X-B: 2')).toEqual(['X-A: 1', 'X-B: 2']);
  });
});
