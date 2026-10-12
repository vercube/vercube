import { Controller, Get, Param, QueryParam } from '@vercube/core';
import { StorageManager } from '@vercube/storage';
import { MemoryStorage } from '@vercube/storage/drivers/MemoryStorage';
import { createTestApp } from '@vercube/testing';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { Cache, CacheManager } from '../src';
import type { TestApp } from '@vercube/testing';

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
  let app: TestApp;
  let storageManager: StorageManager;

  beforeAll(async () => {
    app = await createTestApp({
      controllers: [ProductsController],
      providers: [StorageManager, CacheManager],
    });

    storageManager = app.resolve(StorageManager);
    await storageManager.mount({ name: 'cache', storage: MemoryStorage });
    app.resolve(CacheManager).configure({ storage: 'cache' });
  });

  afterAll(() => app.close());

  beforeEach(async () => {
    handler.mockClear();
    await storageManager.clear({ storage: 'cache' });
  });

  it('should serve a repeated request from the cache', async () => {
    const first = await app.get('/products/1').expect(200);
    const second = await app.get('/products/1');

    await expect(first.json()).resolves.toEqual({ id: '1', hits: 1 });
    await expect(second.json()).resolves.toEqual({ id: '1', hits: 1 });

    expect(handler).toHaveBeenCalledOnce();
  });

  it('should key the cache by the resolved route parameters', async () => {
    await app.get('/products/1');
    await app.get('/products/2');
    await app.get('/products/1');

    expect(handler).toHaveBeenCalledTimes(2);
    expect(handler.mock.calls.map(([id]) => id)).toEqual(['1', '2']);
  });

  it('should key the cache by query parameters too', async () => {
    const first = await app.get('/products/search/1').query({ q: 'red' });
    const second = await app.get('/products/search/1').query({ q: 'blue' });

    await expect(first.json()).resolves.toEqual({ id: '1', query: 'red' });
    await expect(second.json()).resolves.toEqual({ id: '1', query: 'blue' });

    expect(handler).toHaveBeenCalledTimes(2);
  });

  it('should keep the cached entries inside the mounted storage', async () => {
    await app.get('/products/1');

    const keys = await storageManager.getKeys({ storage: 'cache' });

    const expected = await app
      .resolve(CacheManager)
      .resolveKeys({ name: 'ProductsController.getProduct', storage: 'cache' }, '1');

    expect(expected).toHaveLength(1);
    expect(keys).toEqual(expect.arrayContaining(expected));
    await expect(storageManager.size({ storage: 'cache' })).resolves.toBe(1);
  });

  it('should re-run the handler after the entry is invalidated', async () => {
    await app.get('/products/1');

    await app.resolve(CacheManager).invalidate({ name: 'ProductsController.getProduct', storage: 'cache' }, '1');

    const response = await app.get('/products/1');

    await expect(response.json()).resolves.toEqual({ id: '1', hits: 2 });
    expect(handler).toHaveBeenCalledTimes(2);
  });
});
