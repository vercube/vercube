import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@vercube/cli', () => ({}));

describe('create-vercube', () => {
  const argv = process.argv;

  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    process.argv = argv;
  });

  const run = async (...args: string[]): Promise<string[]> => {
    process.argv = ['node', 'create-vercube', ...args];
    // a plain JavaScript bin, so it is imported by URL rather than typed
    await import(/* @vite-ignore */ new URL('../bin/create-vercube.js', import.meta.url).href);

    return process.argv.slice(2);
  };

  it('should run init without arguments', async () => {
    expect(await run()).toEqual(['init']);
  });

  it('should put init before the directory argument', async () => {
    expect(await run('my-app')).toEqual(['init', 'my-app']);
  });

  it('should put init before flags', async () => {
    expect(await run('my-app', '--force')).toEqual(['init', 'my-app', '--force']);
  });
});
