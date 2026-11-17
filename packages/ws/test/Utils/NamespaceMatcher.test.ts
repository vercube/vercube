import { describe, expect, it } from 'vitest';
import { NamespaceMatcher } from '../../src/Utils/NamespaceMatcher';

describe('NamespaceMatcher', () => {
  const matcher = new NamespaceMatcher();
  matcher.add('/chat');
  matcher.add('/ws/boards/:boardId');
  matcher.add('/ws/boards/:boardId/cursors');
  matcher.add('/files/**:path');
  matcher.add('/any/*/thing');

  it('matches a static namespace case-insensitively', () => {
    expect(matcher.match('/Chat')).toEqual({ pattern: '/chat', params: {} });
  });

  it('matches a parametric namespace, keeping the case of names and values', () => {
    expect(matcher.match('/WS/boards/AbC-1')).toEqual({ pattern: '/ws/boards/:boardid', params: { boardId: 'AbC-1' } });
    expect(matcher.match('/ws/boards/42/cursors')).toEqual({ pattern: '/ws/boards/:boardid/cursors', params: { boardId: '42' } });
  });

  it('decodes parameter values and keeps malformed ones verbatim', () => {
    expect(matcher.match('/ws/boards/a%20b')?.params).toEqual({ boardId: 'a b' });
    expect(matcher.match('/ws/boards/100%')?.params).toEqual({ boardId: '100%' });
  });

  it('matches wildcards', () => {
    expect(matcher.match('/files/a/b/c')?.params).toEqual({ path: 'a/b/c' });
    expect(matcher.match('/any/x/thing')?.params).toEqual({ 0: 'x' });
  });

  it('returns nothing for an unknown path', () => {
    expect(matcher.match('/ws/boards')).toBeUndefined();
    expect(matcher.match('/nope')).toBeUndefined();
  });

  it('keeps the first spelling of a pattern', () => {
    const local = new NamespaceMatcher();
    local.add('/x/:Id');
    local.add('/x/:id');

    expect(local.has('/X/:ID')).toBe(true);
    expect(local.match('/x/1')?.params).toEqual({ Id: '1' });
  });
});
