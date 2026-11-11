// The playground's API through @vercube/client, typed by the route map that
// `vercube dev` / `vercube build` keep in `.vercube/routes.d.ts`.
import { createClient } from '@vercube/client';
import { createApp } from '@vercube/core';
import { beforeAll, describe, expect, expectTypeOf, it } from 'vitest';
import { RequestContextController } from '../src/Controllers/RequestContextController';
import { TypedRequestContext } from '../src/Services/TypedRequestContext';
import type { VercubeRoutes } from '../.vercube/routes';

describe('playground API through @vercube/client', () => {
  let api: ReturnType<typeof createClient<VercubeRoutes>>;

  beforeAll(async () => {
    const app = await createApp();

    app.container.expand((container) => {
      container.bind(RequestContextController);
      container.bindTransient(TypedRequestContext);
    });

    api = createClient<VercubeRoutes>({ baseURL: 'http://localhost', fetch: (request) => app.fetch(request) });
  });

  it('returns the handler type, read from the controller', async () => {
    const data = await api.get('/api/request-context/user', { headers: { authorization: 'Bearer user-2137' } });

    expectTypeOf(data.message).toBeString();
    expect(data.userId).toBe('2137');
  });
});
