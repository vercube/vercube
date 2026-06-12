import { describe, expect, it, vi } from 'vitest';
import {
  applyVercubePluginHooks,
  defineVercubePlugin,
  invokeVercubePluginDevHooks,
  isBasePluginClass,
  normalizeVercubePluginInputs,
  vercubePluginFromClass,
  withPluginOptions,
} from '../../src/Plugins/VercubePlugin';
import { BasePlugin } from '../../src/Services/Plugins/BasePlugin';
import { MockPlugin } from '../Utils/Plugin.mock';
import type { ConfigTypes } from '../../src/Types/ConfigTypes';
import type { VercubePluginHooksContext } from '../../src/Types/Plugin';

class OptionsPlugin extends BasePlugin<{ flag: boolean }> {
  public override name = 'options-plugin';
}

describe('applyVercubePluginHooks', () => {
  it('returns config unchanged when plugins are absent', async () => {
    const cfg: ConfigTypes.Config = { logLevel: 'info' };
    const out = await applyVercubePluginHooks(cfg, { cwd: '/' });
    expect(out).toBe(cfg);
  });

  it('merges config hook output and collects cli commands', async () => {
    const registerSpy = vi.fn();
    const cfg: ConfigTypes.Config = {
      logLevel: 'info',
      cli: { commands: [] },
      plugins: [
        defineVercubePlugin({
          name: 'a',
          config: (c) => ({ server: { port: (c.server?.port ?? 0) + 1 } }),
          cli: (ctx) => {
            registerSpy(ctx.cwd);
            ctx.register(class Cmd {});
          },
        }),
      ],
    };

    const out = await applyVercubePluginHooks(cfg, { cwd: '/proj' });

    expect(out.server?.port).toBe(1);
    expect(registerSpy).toHaveBeenCalledWith('/proj');
    expect(out.cli?.commands?.length).toBe(1);
    expect(out.plugins?.length).toBe(1);
  });

  it('runs enforce pre before default', async () => {
    const order: string[] = [];
    const cfg: ConfigTypes.Config = {
      plugins: [
        defineVercubePlugin({
          name: 'mid',
          config: () => {
            order.push('mid');
            return {};
          },
        }),
        defineVercubePlugin({
          name: 'pre',
          enforce: 'pre',
          config: () => {
            order.push('pre');
            return {};
          },
        }),
        defineVercubePlugin({
          name: 'post',
          enforce: 'post',
          config: () => {
            order.push('post');
            return {};
          },
        }),
      ],
    };

    await applyVercubePluginHooks(cfg, { cwd: '/' });
    expect(order).toEqual(['pre', 'mid', 'post']);
  });

  it('ignores plugins key in config hook return value', async () => {
    const cfg: ConfigTypes.Config = {
      plugins: [
        defineVercubePlugin({
          name: 'mutator',
          config: () => ({ plugins: [] as any, server: { port: 9999 } }),
        }),
      ],
    };
    const out = await applyVercubePluginHooks(cfg, { cwd: '/' });
    expect(out.plugins?.length).toBe(1);
    expect(out.server?.port).toBe(9999);
  });
});

describe('vercubePluginFromClass', () => {
  it('wraps BasePlugin classes for the config pipeline', async () => {
    const p = vercubePluginFromClass(MockPlugin);
    const cfg: ConfigTypes.Config = {
      plugins: [p],
    };
    const out = await applyVercubePluginHooks(cfg, { cwd: '/' });
    expect(out.plugins?.length).toBe(1);
  });
});

describe('withPluginOptions', () => {
  it('produces a tuple consumed by the plugin pipeline', async () => {
    const tuple = withPluginOptions(OptionsPlugin, { flag: true });
    expect(tuple[0]).toBe(OptionsPlugin);
    expect(tuple[1]).toEqual({ flag: true });
    const out = await applyVercubePluginHooks({ plugins: [tuple] }, { cwd: '/' });
    expect(out.plugins?.length).toBe(1);
  });
});

describe('defineVercubePlugin', () => {
  it('returns the same object reference', () => {
    const plugin = defineVercubePlugin({ name: 'same' });
    expect(defineVercubePlugin(plugin)).toBe(plugin);
  });
});

describe('isBasePluginClass', () => {
  it('is true for BasePlugin subclasses', () => {
    expect(isBasePluginClass(MockPlugin)).toBe(true);
    expect(isBasePluginClass(OptionsPlugin)).toBe(true);
  });

  it('is false for non-constructors and plain classes', () => {
    expect(isBasePluginClass(null)).toBe(false);
    expect(isBasePluginClass(undefined)).toBe(false);
    expect(isBasePluginClass({})).toBe(false);
    expect(isBasePluginClass(() => {})).toBe(false);
    expect(
      isBasePluginClass(
        class NotPlugin {
          public name = 'x';
        },
      ),
    ).toBe(false);
  });
});

describe('normalizeVercubePluginInputs', () => {
  it('returns an empty array for undefined or empty input', async () => {
    expect(await normalizeVercubePluginInputs(undefined)).toEqual([]);
    expect(await normalizeVercubePluginInputs([])).toEqual([]);
  });

  it('resolves sync and async factory functions', async () => {
    const a = defineVercubePlugin({ name: 'sync-factory' });
    const b = defineVercubePlugin({ name: 'async-factory' });
    const out = await normalizeVercubePluginInputs([() => a, async () => b]);
    expect(out.map((p) => p.name)).toEqual(['sync-factory', 'async-factory']);
  });

  it('unwraps single-element arrays recursively', async () => {
    const p = defineVercubePlugin({ name: 'wrapped' });
    const out = await normalizeVercubePluginInputs([[p] as any]);
    expect(out).toHaveLength(1);
    expect(out[0].name).toBe('wrapped');
  });

  it('throws on invalid tuple shape', async () => {
    await expect(normalizeVercubePluginInputs([['not-a-class', 1] as any])).rejects.toThrow(/Invalid plugin entry/);
  });
});

describe('invokeVercubePluginDevHooks', () => {
  it('no-ops when plugins are missing or empty', async () => {
    const ctx = { config: {} as ConfigTypes.Config, hooks: {} } satisfies VercubePluginHooksContext;
    await expect(invokeVercubePluginDevHooks(undefined, ctx)).resolves.toBeUndefined();
    await expect(invokeVercubePluginDevHooks([], ctx)).resolves.toBeUndefined();
  });

  it('calls hooks on each plugin in order', async () => {
    const order: string[] = [];
    const ctx = { config: {} as ConfigTypes.Config, hooks: {} } satisfies VercubePluginHooksContext;
    await invokeVercubePluginDevHooks(
      [
        defineVercubePlugin({
          name: 'first',
          hooks: async () => {
            order.push('first');
          },
        }),
        defineVercubePlugin({
          name: 'second',
          hooks: async () => {
            order.push('second');
          },
        }),
      ],
      ctx,
    );
    expect(order).toEqual(['first', 'second']);
  });
});
