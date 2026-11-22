import { describe, expect, it, vi } from 'vitest';
import { ClientErrors, createClient } from '../../src';
import type { TestRoutes } from '../fixtures/Controllers';

const fetch = vi.fn(async () => Response.json({ ok: true }));
const api = createClient<TestRoutes>({ baseURL: 'http://test', fetch });

/** What `getErrorGuidance()` of `@vercube/di` reads off an error. */
interface Described extends Error {
  code?: string;
  why?: string;
  fix?: string;
  link?: string;
}

describe('ClientErrors', () => {
  it('describes a missing path parameter', async () => {
    const error = (await api.get('/users/:id', { params: {} as never }).catch((error_: unknown) => error_)) as Described;

    expect(error.constructor).toBe(TypeError);
    expect(error.message).toBe('Missing path parameter "id" for /users/:id');
    expect(error.code).toBe('VERCUBE_CLIENT_MISSING_PATH_PARAMETER');
    expect(error.why).toBe(ClientErrors.MISSING_PATH_PARAMETER.why);
    expect(error.fix).toContain('params');
    expect(error.link).toBe('https://vercube.dev/docs/core-features/errors#vercube_client_missing_path_parameter');
  });

  it('describes a path parameter that would leave the route', async () => {
    const error = (await api.get('/users/:id', { params: { id: '..' } }).catch((error_: unknown) => error_)) as Described;

    expect(error.constructor).toBe(TypeError);
    expect(error.message).toBe('Path parameter "id" cannot be "." or ".." in /users/:id');
    expect(error.code).toBe('VERCUBE_CLIENT_INVALID_PATH_PARAMETER');
  });

  it('keeps the guidance out of what an error serialises to', async () => {
    const error = (await api.get('/users/:id', { params: {} as never }).catch((error_: unknown) => error_)) as Described;

    expect(Object.keys(error)).toEqual([]);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('lists its errors the way a catalog of the framework does', () => {
    expect(ClientErrors.prefix).toBe('VERCUBE_CLIENT');
    expect(ClientErrors.describe()).toEqual([
      {
        code: 'VERCUBE_CLIENT_MISSING_PATH_PARAMETER',
        message: 'Missing path parameter "<name>" for <path>',
        why: ClientErrors.MISSING_PATH_PARAMETER.why,
        fix: ClientErrors.MISSING_PATH_PARAMETER.fix,
        link: ClientErrors.MISSING_PATH_PARAMETER.link,
      },
      {
        code: 'VERCUBE_CLIENT_INVALID_PATH_PARAMETER',
        message: 'Path parameter "<name>" cannot be "." or ".." in <path>',
        why: ClientErrors.INVALID_PATH_PARAMETER.why,
        fix: ClientErrors.INVALID_PATH_PARAMETER.fix,
        link: ClientErrors.INVALID_PATH_PARAMETER.link,
      },
    ]);
  });
});
