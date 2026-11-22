import { describe, expect, it } from 'vitest';
import { buildPath, buildQuery, buildTarget, pathParams } from '../../ui/src/playground/url';

describe('pathParams', () => {
  it('finds nothing in a static template', () => {
    expect(pathParams('/users')).toEqual([]);
    expect(pathParams('/')).toEqual([]);
  });

  it('lists named placeholders in order', () => {
    expect(pathParams('/users/:userId/posts/:postId')).toEqual([
      { name: 'userId', rest: false },
      { name: 'postId', rest: false },
    ]);
  });

  it('finds placeholders that share a segment', () => {
    expect(pathParams('/files/:name.:ext')).toEqual([
      { name: 'name', rest: false },
      { name: 'ext', rest: false },
    ]);
  });

  it('lists wildcards', () => {
    expect(pathParams('/assets/*/raw')).toEqual([{ name: '*', rest: false }]);
    expect(pathParams('/assets/**')).toEqual([{ name: '**', rest: true }]);
    expect(pathParams('/assets/**:path')).toEqual([{ name: 'path', rest: true }]);
  });
});

describe('buildPath', () => {
  it('fills and encodes named placeholders', () => {
    expect(buildPath('/users/:id', { id: 'a b/c' })).toEqual({ path: '/users/a%20b%2Fc', missing: [] });
  });

  it('leaves an unfilled placeholder in place and reports it', () => {
    expect(buildPath('/users/:id/posts/:post', { id: '7', post: '' })).toEqual({
      path: '/users/7/posts/:post',
      missing: ['post'],
    });
    expect(buildPath('/users/:id', {})).toEqual({ path: '/users/:id', missing: ['id'] });
  });

  it('fills placeholders that share a segment', () => {
    expect(buildPath('/files/:name.:ext', { name: 'report', ext: 'pdf' }).path).toBe('/files/report.pdf');
  });

  it('keeps the slashes of a rest placeholder', () => {
    expect(buildPath('/assets/**', { '**': 'img/a b.png' }).path).toBe('/assets/img/a%20b.png');
    expect(buildPath('/assets/**:path', { path: 'css/site.css' }).path).toBe('/assets/css/site.css');
    expect(buildPath('/assets/**:path', {})).toEqual({ path: '/assets/**:path', missing: ['path'] });
  });

  it('encodes the slashes of a one-segment wildcard', () => {
    expect(buildPath('/assets/*/raw', { '*': 'a/b' }).path).toBe('/assets/a%2Fb/raw');
    expect(buildPath('/assets/*', {})).toEqual({ path: '/assets/*', missing: ['*'] });
  });

  it('answers the root for an empty template', () => {
    expect(buildPath('', {}).path).toBe('/');
  });
});

describe('buildQuery', () => {
  it('encodes entries and keeps repeats', () => {
    expect(
      buildQuery([
        { name: 'q', value: 'a b&c' },
        { name: 'tag', value: 'x' },
        { name: 'tag', value: 'y' },
      ]),
    ).toBe('q=a+b%26c&tag=x&tag=y');
  });

  it('leaves out entries without a name or a value', () => {
    expect(
      buildQuery([
        { name: '', value: 'x' },
        { name: ' ', value: 'x' },
        { name: 'limit', value: '' },
      ]),
    ).toBe('');
  });
});

describe('buildTarget', () => {
  it('joins the path and the query', () => {
    expect(buildTarget('/users/:id', { id: '7' }, [{ name: 'full', value: 'true' }])).toEqual({
      path: '/users/7?full=true',
      missing: [],
    });
  });

  it('adds no question mark without a query', () => {
    expect(buildTarget('/users/:id', { id: '7' }, []).path).toBe('/users/7');
  });
});
