import { describe, it, expect } from 'vitest';
import { getBuildFunc, getWatchFunc } from '../src/Utils/Utils';
import {
  build as rolldownBuild,
  watch as rolldownWatch,
} from '../src/Bundlers/Rolldown';

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
