import { describeContainer } from '@vercube/di';
import { beforeAll, describe, expect, it } from 'vitest';
import { BaseMiddleware, Controller, createApp, Get, IntrospectionRegistry, Middleware, Post, QueryParam } from '../../../src';
import { defaultConfig } from '../../../src/Config/DefaultConfig';
import type { App } from '../../../src';
import type { IntrospectionTypes } from '../../../src/Types/IntrospectionTypes';
import type { Describe } from '@vercube/di';

class AuditMiddleware extends BaseMiddleware {
  public onRequest(): void {
    // no-op
  }
}

@Controller('/catalog')
class CatalogController {
  @Get('/:id')
  public byId(): unknown {
    return { ok: true };
  }

  @Post('/search')
  @Middleware(AuditMiddleware, { priority: 5 })
  public search(@QueryParam({ name: 'q' }) query: string): unknown {
    return { query };
  }
}

describe('core introspection providers', () => {
  let app: App;
  let registry: IntrospectionRegistry;

  beforeAll(async () => {
    app = await createApp({
      cfg: {
        ...defaultConfig,
        requestLogging: false,
        logLevel: 'error',
        runtime: { apiToken: 'super-secret', pageSize: 25 },
      },
      setup: (instance) => {
        instance.container.bind(CatalogController);
        instance.container.bind(AuditMiddleware);
      },
    });

    registry = app.container.get(IntrospectionRegistry);
  });

  it('registers the built-in sections', () => {
    expect(registry.list().map((section) => section.id)).toEqual(['config', 'container', 'discovery', 'plugins', 'routes']);
  });

  it('describes discovery as null without a build manifest', async () => {
    const section = await registry.describe('discovery');

    expect(section?.data).toBeNull();
  });

  it('describes every route registration', async () => {
    const section = await registry.describe<IntrospectionTypes.RouteDescription[]>('routes');
    const byId = section!.data.find((route) => route.id === 'GET /catalog/:id');

    expect(byId).toMatchObject({
      method: 'GET',
      path: '/catalog/:id',
      controller: 'CatalogController',
      handler: 'byId',
      basePath: '/catalog',
      actions: 0,
    });

    // `@Get` registers HEAD too; the raw table shows both.
    expect(section!.data.some((route) => route.id === 'HEAD /catalog/:id')).toBe(true);
  });

  it('describes route arguments and middlewares', async () => {
    const section = await registry.describe<IntrospectionTypes.RouteDescription[]>('routes');
    const search = section!.data.find((route) => route.id === 'POST /catalog/search')!;

    expect(search.args).toEqual([{ idx: 0, type: 'query-param', name: 'q', validated: false }]);
    expect(search.middlewares).toContainEqual({ name: 'AuditMiddleware', phase: 'before', priority: 5, global: false });
  });

  it('redacts credentials in the config section', async () => {
    const section = await registry.describe<IntrospectionTypes.ConfigDescription>('config');
    const token = section!.data.runtime.find((entry) => entry.path === 'apiToken');

    expect(token).toEqual({ path: 'apiToken', value: '<redacted>', redacted: true });
    expect(section!.data.runtime).toContainEqual({ path: 'pageSize', value: '25' });
  });

  it('keeps the runtime slice out of the app config', async () => {
    const section = await registry.describe<IntrospectionTypes.ConfigDescription>('config');

    expect(section!.data.app.some((entry) => entry.path.startsWith('runtime.'))).toBe(false);
  });

  it('classifies container services', async () => {
    const section = await registry.describe<Describe.ContainerDescription>('container');
    const byName = new Map(section!.data.nodes.map((node) => [node.name, node]));

    expect(byName.get('CatalogController')).toMatchObject({ role: 'controller', basePath: '/catalog' });
    expect(byName.get('Router')?.role).toBe('framework');
    expect(byName.get('AuditMiddleware')?.role).toBe('middleware');
  });

  it('never instantiates a service just to describe it', () => {
    const before = app.container.hasInstance(CatalogController);

    describeContainer(app.container);

    expect(app.container.hasInstance(CatalogController)).toBe(before);
  });

  it('bumps the routes revision when a route is added', async () => {
    const first = registry.list().find((section) => section.id === 'routes')!.revision;

    app.container.get(IntrospectionRegistry);
    const { Router } = await import('../../../src/Services/Router/Router');
    app.container.get(Router).addRoute({
      path: '/late',
      method: 'GET',
      handler: {
        instance: {},
        propertyName: 'late',
        args: [],
        middlewares: { beforeMiddlewares: [], afterMiddlewares: [] },
        actions: [],
      },
    });

    expect(registry.list().find((section) => section.id === 'routes')!.revision).toBeGreaterThan(first);
  });
});
