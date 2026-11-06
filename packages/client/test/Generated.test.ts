// The generator's output for the fixture controllers, checked in as
// `fixtures/routes.d.ts` so `tsc` type-checks it against the client.
// Regenerate with `UPDATE_FIXTURES=1 pnpm vitest run packages/client`.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createApp, IntrospectionRegistry, MetadataResolver } from '@vercube/core';
import { findControllers, generateRouteTypes } from '@vercube/scan';
import { describe, expect, it } from 'vitest';
import { AccountController, EventsController, GuardMiddleware, MovedController, UserController } from './fixtures/Controllers';
import type { IntrospectionTypes } from '@vercube/core';

const fixtures = join(import.meta.dirname, 'fixtures');
const outFile = join(fixtures, 'routes.d.ts');

describe('generated route map', () => {
  it('matches the checked-in fixture', async () => {
    const app = await createApp({
      configFile: false,
      cfg: { requestLogging: false, logLevel: 'error' },
      setup: async (app) => {
        app.container.get(MetadataResolver).setControllerPath(MovedController, '/v2');
        app.container.bind(UserController);
        app.container.bind(EventsController);
        app.container.bind(MovedController);
        app.container.bind(AccountController);
        app.container.bind(GuardMiddleware);
      },
    });

    const routes = await app.container.get(IntrospectionRegistry).describe<IntrospectionTypes.RouteDescription[]>('routes');

    await app.close();

    const { code, skipped, warnings } = generateRouteTypes({
      routes: routes!.data,
      controllers: await findControllers([join(fixtures, 'Controllers.ts')]),
      outFile,
      // the package's own source, so the fixture needs no build
      clientModule: '../../src',
    });

    expect(skipped).toEqual([]);
    // `GoneError` is not exported from the controller file
    expect(warnings).toEqual([expect.stringMatching(/^PUT \/account\/email: cannot import the type of GoneError \(410\)/)]);

    if (process.env.UPDATE_FIXTURES || !existsSync(outFile)) {
      writeFileSync(outFile, code);
    }

    expect(code).toBe(readFileSync(outFile, 'utf8'));
  });
});
