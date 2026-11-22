import { describe, expect, it } from 'vitest';
import { buildPath, buildQuery, buildTarget, pathParams, resolveTarget } from '../../ui/src/playground/url';

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

describe('resolveTarget', () => {
  const origin = 'http://localhost:3001';

  /**
   * Builds a target from a template and resolves it, as the playground does.
   *
   * @param template - Route template
   * @param values - Path values
   * @param query - Query entries
   * @returns The resolved URL, or the refusal
   */
  function resolve(
    template: string,
    values: Record<string, string>,
    query: { name: string; value: string }[] = [],
  ): ReturnType<typeof resolveTarget> {
    return resolveTarget(buildTarget(template, values, query).path, origin);
  }

  it('resolves a normal route to the URL that is sent', () => {
    expect(resolve('/users/:id', { id: '7' }, [{ name: 'full', value: 'true' }])).toEqual({
      ok: true,
      href: 'http://localhost:3001/users/7?full=true',
    });
    expect(resolve('/files/**:path', { path: 'docs/a b.txt' })).toEqual({
      ok: true,
      href: 'http://localhost:3001/files/docs/a%20b.txt',
    });
    expect(resolve('/', {})).toEqual({ ok: true, href: 'http://localhost:3001/' });
  });

  it('refuses a root catch-all whose value starts with a slash, which names another host', () => {
    for (const template of ['/**', '/**:path']) {
      const built = buildTarget(template, { '**': '/docs/x', path: '/docs/x' }, []).path;
      const resolved = resolveTarget(built, origin);

      // The text looks like a path of this application. `fetch` reads it as `http://docs/x`.
      expect(built).toBe('//docs/x');
      expect(new URL(built, origin).origin).toBe('http://docs');
      expect(resolved.ok).toBe(false);
      expect(resolved).toMatchObject({ reason: expect.stringContaining('http://docs') });
    }
  });

  it('accepts a catch-all value with a leading slash below a prefix', () => {
    expect(resolve('/files/**', { '**': '/docs/x' })).toEqual({ ok: true, href: 'http://localhost:3001/files//docs/x' });
  });

  it('refuses dot segments, which the browser removes before the request leaves', () => {
    for (const value of ['..', '.']) {
      const resolved = resolve('/users/:id/sessions', { id: value });

      expect(resolved.ok).toBe(false);
      expect(resolved).toMatchObject({ reason: expect.stringContaining(`/users/${value}/sessions`) });
    }

    expect(resolve('/files/**', { '**': 'a/../../admin' }).ok).toBe(false);
    expect(resolve('/files/**', { '**': '..' }).ok).toBe(false);
  });

  it('refuses percent-encoded dot segments in a target', () => {
    // A browser treats `%2e` as a dot here: this would be sent as `DELETE /sessions`.
    expect(new URL('/users/%2e%2e/sessions', origin).pathname).toBe('/sessions');
    expect(resolveTarget('/users/%2e%2e/sessions', origin).ok).toBe(false);
    expect(resolveTarget('/users/%2E/sessions', origin).ok).toBe(false);
    expect(resolveTarget('/users/.%2e/sessions', origin).ok).toBe(false);
  });

  it('sends a typed %2e%2e as those six characters, which is no dot segment', () => {
    expect(resolve('/users/:id/sessions', { id: '%2e%2e' })).toEqual({
      ok: true,
      href: 'http://localhost:3001/users/%252e%252e/sessions',
    });
  });

  it('refuses a target that is another URL or does not parse', () => {
    expect(resolveTarget('https://example.com/x', origin).ok).toBe(false);
    expect(resolveTarget('/x', 'not an origin').ok).toBe(false);
    expect(resolveTarget('/x#part', origin).ok).toBe(false);
  });

  it('accepts a character the parser encodes without changing the path', () => {
    expect(resolveTarget('/caf\u00E9/a b', origin)).toEqual({ ok: true, href: 'http://localhost:3001/caf%C3%A9/a%20b' });
  });
});
