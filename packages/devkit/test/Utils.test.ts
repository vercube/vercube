import { describe, expect, it } from 'vitest';
import { build as rolldownBuild, watch as rolldownWatch } from '../src/Bundlers/Rolldown';
import { getBuildFunc, getWatchFunc } from '../src/Utils/Utils';

describe('Utils', () => {
  describe('getBuildFunc', () => {
    it('should return rolldown build function for rolldown bundler', () => {
      const buildFunc = getBuildFunc('rolldown');
      expect(buildFunc).toBe(rolldownBuild);
    });

    it('should return rolldown build function for unknown bundler', () => {
      const buildFunc = getBuildFunc('unknown');
      expect(buildFunc).toBe(rolldownBuild);
    });

    it('should return rolldown build function when no bundler specified', () => {
      const buildFunc = getBuildFunc('');
      expect(buildFunc).toBe(rolldownBuild);
    });
  });

  describe('getWatchFunc', () => {
    it('should return rolldown watch function for rolldown bundler', () => {
      const watchFunc = getWatchFunc('rolldown');
      expect(watchFunc).toBe(rolldownWatch);
    });

    it('should return rolldown watch function for unknown bundler', () => {
      const watchFunc = getWatchFunc('unknown');
      expect(watchFunc).toBe(rolldownWatch);
    });

    it('should return rolldown watch function when no bundler specified', () => {
      const watchFunc = getWatchFunc('');
      expect(watchFunc).toBe(rolldownWatch);
    });
  });
});

describe('dependencyPatterns', () => {
  it('should match a dependency and its subpaths only', async () => {
    const { dependencyPatterns } = await import('../src/Bundlers/Rolldown/Config');
    const [storage, dotted] = dependencyPatterns(['@vercube/storage', 'lodash.get']);

    expect(storage.test('@vercube/storage')).toBe(true);
    expect(storage.test('@vercube/storage/drivers/MemoryStorage')).toBe(true);
    expect(storage.test('@vercube/storage-extra')).toBe(false);
    expect(dotted.test('lodash.get')).toBe(true);
    expect(dotted.test('lodashxget')).toBe(false);
  });
});
