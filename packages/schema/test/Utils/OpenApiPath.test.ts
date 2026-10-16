import { describe, expect, it } from 'vitest';
import { toOpenApiPath } from '../../src/Utils/OpenApiPath';

const path = (input: string) => toOpenApiPath(input);

describe('toOpenApiPath', () => {
  it('should leave static paths untouched', () => {
    expect(path('/api/pages')).toEqual({ path: '/api/pages', params: [], optional: [], patterns: {} });
  });

  it('should convert named params', () => {
    expect(path('/pages/:pageId/comments/:id')).toMatchObject({
      path: '/pages/{pageId}/comments/{id}',
      params: ['pageId', 'id'],
    });
  });

  it('should convert params embedded in a segment', () => {
    expect(path('/files/:name.:ext')).toMatchObject({ path: '/files/{name}.{ext}', params: ['name', 'ext'] });
  });

  it('should name unnamed params the way rou3 1.0 does', () => {
    expect(path('/a/*')).toMatchObject({ path: '/a/{0}', params: ['0'] });
    expect(path(String.raw`/a/(\d+)`)).toMatchObject({ path: '/a/{0}', params: ['0'], patterns: { 0: '\\d+' } });
    expect(path('/a/*.png')).toMatchObject({ path: '/a/{0}.png', params: ['0'] });
    expect(path('/a/*/b/(x|y)')).toMatchObject({ path: '/a/{0}/b/{1}', params: ['0', '1'] });
    expect(path('/assets/**')).toMatchObject({ path: '/assets/{_}', params: ['_'] });
    expect(path('/assets/**:rest')).toMatchObject({ path: '/assets/{rest}', params: ['rest'] });
  });

  it('should drop modifiers and expressions from the path', () => {
    expect(path('/a/:id?')).toEqual({ path: '/a/{id}', params: ['id'], optional: ['id'], patterns: {} });
    expect(path(String.raw`/a/:id(\d+)`)).toEqual({ path: '/a/{id}', params: ['id'], optional: [], patterns: { id: '\\d+' } });
    expect(path('/a/:p+')).toMatchObject({ path: '/a/{p}', params: ['p'] });
    expect(path('/a/:p*')).toMatchObject({ path: '/a/{p}', params: ['p'] });
    expect(path('/a/:id((a)|b)?')).toEqual({ path: '/a/{id}', params: ['id'], optional: ['id'], patterns: { id: '(a)|b' } });
  });

  it('should keep escaped characters literal', () => {
    expect(path(String.raw`/a/\:lit`)).toEqual({ path: '/a/:lit', params: [], optional: [], patterns: {} });
    expect(path(String.raw`/a/\*`)).toMatchObject({ path: '/a/*', params: [] });
  });

  it('should keep a colon that starts no name literal, and an unclosed group as a pattern', () => {
    expect(path('/a/:/x')).toMatchObject({ path: '/a/:/x', params: [] });
    expect(path(String.raw`/a/(\d+`)).toMatchObject({ path: '/a/{0}', patterns: { 0: '\\d+' } });
  });

  it('should always start with a slash', () => {
    expect(path('users/:id')).toMatchObject({ path: '/users/{id}' });
  });
});
