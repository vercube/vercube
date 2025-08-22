import { Container } from '@vercube/di';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PluginsRegistry } from '../../src/Services/Plugins/PluginsRegistry';
import { MockPlugin, MockPlugin2 } from '../Utils/Plugin.mock';

describe('PluginsRegistry', () => {
  let container: Container;

  beforeEach(() => {
    container = new Container();
    container.bindInstance(Container, container);
    container.bind(PluginsRegistry);
  });

  it('should register global middleware', () => {
    const registry = container.get(PluginsRegistry);
    registry.register(MockPlugin);

    expect(registry.plugins.length).toBe(1);
    expect(registry.plugins[0].name).toBe('mock');
  });

  it('should throw error if plugin has no name', () => {
    const registry = container.get(PluginsRegistry);
    expect(() => {
      registry.register(MockPlugin2);
    }).toThrow('Plugin must have a name');
  });

  it('should initialize plugins', async () => {
    const spyOnUse = vi.spyOn(MockPlugin.prototype, 'use');

    const registry = container.get(PluginsRegistry);
    registry.register(MockPlugin);

    registry.init(null as any);

    expect(spyOnUse).toHaveBeenCalled();
  });
});
