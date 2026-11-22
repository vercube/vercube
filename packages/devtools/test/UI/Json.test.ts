import { describe, expect, it } from 'vitest';
import { formatJson } from '../../ui/src/playground/json';

describe('formatJson', () => {
  it('indents a document like JSON.stringify does', () => {
    const value = { a: 1, b: [true, null, 'x', { c: -1.5e3 }], d: {}, e: [], f: 'say "hi", {ok}: [1]' };

    expect(formatJson(JSON.stringify(value))).toBe(JSON.stringify(value, null, 2));
    expect(formatJson(JSON.stringify(value, null, 8))).toBe(JSON.stringify(value, null, 2));
    expect(formatJson('  [ ]  ')).toBe('[]');
    expect(formatJson('"text"')).toBe('"text"');
    expect(formatJson('12')).toBe('12');
  });

  it('keeps an integer above 2^53 as it was written', () => {
    expect(JSON.stringify(JSON.parse('{"id":9007199254740993}'))).toBe('{"id":9007199254740992}');
    expect(formatJson('{"id":9007199254740993}')).toBe('{\n  "id": 9007199254740993\n}');
  });

  it('keeps both of two members with the same name', () => {
    expect(formatJson('{"a":1,"a":2}')).toBe('{\n  "a": 1,\n  "a": 2\n}');
  });

  it('keeps the spelling of numbers and strings', () => {
    expect(formatJson(String.raw`[1.0,1e2,"\u00e9\n","a\"b"]`)).toBe('[\n  1.0,\n  1e2,\n  "\\u00e9\\n",\n  "a\\"b"\n]');
  });

  it('returns text that is not JSON unchanged', () => {
    expect(formatJson('{"a":')).toBe('{"a":');
    expect(formatJson('not json')).toBe('not json');
    expect(formatJson('')).toBe('');
  });

  it('indents by the width asked for', () => {
    expect(formatJson('{"a":[1]}', 4)).toBe('{\n    "a": [\n        1\n    ]\n}');
  });
});
