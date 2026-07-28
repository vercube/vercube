import { Controller, createApp, Get, Param, QueryParam } from '@vercube/core';
import { Logger } from '@vercube/logger';
import { StorageManager } from '@vercube/storage';
import { MemoryStorage } from '@vercube/storage/drivers/MemoryStorage';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { Cache, CacheManager } from '../src';
import type { App } from '@vercube/core';

const handler = vi.fn();

@Controller('/products')
class ProductsController {
  @Get('/:id')
  @Cache({ maxAge: 60 })
  public async getProduct(@Param('id') id: string): Promise<{ id: string; hits: number }> {
    handler(id);
    return { id, hits: handler.mock.calls.length };
  }

  @Get('/search/:id')
  @Cache({ maxAge: 60 })
  public async search(@Param('id') id: string, @QueryParam({ name: 'q' }) query: string): Promise<{ id: string; query: string }> {
    handler(id, query);
    return { id, query };
  }
}

describe('@Cache in a live request pipeline', () => {
  let app: App;
  let storageManager: StorageManager;

  // the app is built once: binding a controller class into a second container
  // re-runs its route decorators and prefixes the path again (/products/products/:id)
  beforeAll(async () => {
    app = await createApp();

    app.container.expand((container) => {
      container.bindMock(Logger, { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() });
      container.bind(StorageManager);
      container.bind(CacheManager);
      container.bind(ProductsController);
    });

    storageManager = app.container.get(StorageManager);
    await storageManager.mount({ name: 'cache', storage: MemoryStorage });
    app.container.get(CacheManager).configure({ storage: 'cache' });
  });

  beforeEach(async () => {
    handler.mockClear();
    await storageManager.clear({ storage: 'cache' });
  });

  it('should serve a repeated request from the cache', async () => {
    const first = await app.fetch(new Request('http://localhost/products/1'));
    const second = await app.fetch(new Request('http://localhost/products/1'));

    expect(first.status).toBe(200);
    await expect(first.json()).resolves.toEqual({ id: '1', hits: 1 });
    await expect(second.json()).resolves.toEqual({ id: '1', hits: 1 });

    expect(handler).toHaveBeenCalledOnce();
  });

  it('should key the cache by the resolved route parameters', async () => {
    await app.fetch(new Request('http://localhost/products/1'));
    await app.fetch(new Request('http://localhost/products/2'));
    await app.fetch(new Request('http://localhost/products/1'));

    expect(handler).toHaveBeenCalledTimes(2);
    expect(handler.mock.calls.map(([id]) => id)).toEqual(['1', '2']);
  });

  it('should key the cache by query parameters too', async () => {
    const first = await app.fetch(new Request('http://localhost/products/search/1?q=red'));
    const second = await app.fetch(new Request('http://localhost/products/search/1?q=blue'));

    await expect(first.json()).resolves.toEqual({ id: '1', query: 'red' });
    await expect(second.json()).resolves.toEqual({ id: '1', query: 'blue' });

    expect(handler).toHaveBeenCalledTimes(2);
  });

  it('should keep the cached entries inside the mounted storage', async () => {
    await app.fetch(new Request('http://localhost/products/1'));

    const keys = await storageManager.getKeys({ storage: 'cache' });

    expect(keys.some((key) => key.startsWith('/cache/cache:functions:ProductsController.getProduct:'))).toBe(true);
    await expect(storageManager.size({ storage: 'cache' })).resolves.toBe(1);
  });

  it('should re-run the handler after the entry is invalidated', async () => {
    await app.fetch(new Request('http://localhost/products/1'));

    await app.container.get(CacheManager).invalidate({ name: 'ProductsController.getProduct', storage: 'cache' }, '1');

    const response = await app.fetch(new Request('http://localhost/products/1'));

    await expect(response.json()).resolves.toEqual({ id: '1', hits: 2 });
    expect(handler).toHaveBeenCalledTimes(2);
  });
});
