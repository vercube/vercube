import { defineRecipe } from '../Apply';

const CONTROLLER = `import { Cache } from '@vercube/cache';
import { Controller, Get, Param } from '@vercube/core';

/**
 * The same zone answers the same time for 30 seconds: the result is cached.
 */
@Controller('/api/time')
export default class TimeController {
  @Get('/:zone')
  @Cache({ maxAge: 30 })
  public async now(@Param('zone') zone: string): Promise<{ zone: string; at: string }> {
    return { zone, at: new Date().toISOString() };
  }
}
`;

export const cacheRecipe = defineRecipe({
  id: 'cache',
  label: 'Cache',
  hint: 'cached methods, on a storage mount',
  // the cache keeps its entries in a storage mount
  requires: ['storage'],
  apply: ({ project }) => {
    project.addDependencies({ '@vercube/cache': 'latest', '@vercube/storage': 'latest' });
    project.createFile('src/controller/TimeController.ts', CONTROLLER);
    project.bind({ name: 'StorageManager', from: '@vercube/storage' });
    project.bind({ name: 'CacheManager', from: '@vercube/cache' });
    project.addToContainer("void container.get(StorageManager).mount({ name: 'cache', storage: MemoryStorage });", {
      StorageManager: '@vercube/storage',
      MemoryStorage: '@vercube/storage/drivers/MemoryStorage',
    });
    project.addToContainer("container.get(CacheManager).configure({ storage: 'cache', maxAge: 60 });", {
      CacheManager: '@vercube/cache',
    });
    project.bind({ name: 'TimeController', from: '@/controller/TimeController', default: true });
  },
});
