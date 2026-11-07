import { describe, expect, it } from 'vitest';
import { previewReplacer, previewValue } from '../../src/Utils/Preview';

describe('previewReplacer', () => {
  it('renders a repeated non-circular reference in full', () => {
    const o = { x: 1 };

    expect(JSON.stringify({ a: o, b: o }, previewReplacer())).toBe('{"a":{"x":1},"b":{"x":1}}');
  });

  it('renders a diamond in full', () => {
    const shared = { n: 1 };
    const value = { left: { shared }, right: { shared } };

    expect(JSON.parse(JSON.stringify(value, previewReplacer()))).toEqual(value);
  });

  it('renders repeated references inside arrays, Maps and Sets', () => {
    const o = { x: 1 };
    const out = JSON.parse(JSON.stringify({ list: [o, o], map: new Map([['k', o]]), o }, previewReplacer()));

    expect(out).toEqual({ list: [o, o], map: { '[Map]': { k: o } }, o });
  });

  it('marks a real cycle', () => {
    const a: Record<string, unknown> = { name: 'a' };
    a.self = a;

    expect(JSON.stringify(a, previewReplacer())).toBe('{"name":"a","self":"[circular]"}');
  });

  it('marks a deeper cycle but not the sibling that shares its node', () => {
    const parent: Record<string, unknown> = { id: 1 };
    const child = { parent };
    parent.child = child;

    const text = previewValue({ a: parent, b: { ref: child } }).text!;

    expect(text).toContain('[circular]');
    expect(JSON.parse(text).b.ref.parent.child).toBe('[circular]');
  });

  it('describes bigint, function and typed array values', () => {
    const out = JSON.parse(JSON.stringify({ n: 5n, f() {}, b: new Uint8Array(3), s: new Set([1]) }, previewReplacer()));

    expect(out).toEqual({ n: '5n', f: '[function f]', b: '[Uint8Array 3 bytes]', s: { '[Set]': [1] } });
  });
});
