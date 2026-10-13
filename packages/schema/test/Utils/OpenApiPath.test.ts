import { describe, expect, it } from 'vitest';
import { toOpenApiPath } from '../../src/Utils/OpenApiPath';

describe('toOpenApiPath', () => {
  it('should leave static paths untouched', () => {
    expect(toOpenApiPath('/api/pages')).toEqual({ path: '/api/pages', params: [] });
  });

  it('should convert named params', () => {
    expect(toOpenApiPath('/pages/:pageId/comments/:id')).toEqual({
      path: '/pages/{pageId}/comments/{id}',
      params: ['pageId', 'id'],
    });
  });

  it('should convert params embedded in a segment', () => {
    expect(toOpenApiPath('/files/:name.:ext')).toEqual({ path: '/files/{name}.{ext}', params: ['name', 'ext'] });
  });

  it('should convert wildcards using rou3 param names', () => {
    expect(toOpenApiPath('/a/*/b/*')).toEqual({ path: '/a/{_0}/b/{_1}', params: ['_0', '_1'] });
    expect(toOpenApiPath('/assets/**')).toEqual({ path: '/assets/{_}', params: ['_'] });
    expect(toOpenApiPath('/assets/**:rest')).toEqual({ path: '/assets/{rest}', params: ['rest'] });
  });
});
