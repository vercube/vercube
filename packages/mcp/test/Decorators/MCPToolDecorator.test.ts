import { Container, destroyDecorators, initializeContainer } from '@vercube/di';
import { beforeEach, describe, expect, it } from 'vitest';
import { z } from 'zod/v3';
import { MCPTool } from '../../src/Decorators/Tool';
import { ToolRegistry } from '../../src/Services/ToolRegistry';

class ToolController {
  @MCPTool({
    name: 'testTool',
    description: 'Test tool',
    inputSchema: z.object({
      message: z.string(),
    }),
  })
  public execute(): string {
    return 'ok';
  }
}

describe('MCPToolDecorator', () => {
  let container: Container;

  beforeEach(() => {
    container = new Container();
    container.bind(ToolRegistry);
    container.bind(ToolController);
    initializeContainer(container);
  });

  it('registers tool metadata and exposes manifest entry', () => {
    const registry = container.get(ToolRegistry);

    const entries = registry.list();
    expect(entries).toHaveLength(1);

    const [entry] = entries;
    expect(entry.metadata.name).toBe('testTool');
    expect(entry.metadata.description).toBe('Test tool');
    expect(entry.metadata.inputSchema).toBeDefined();
    expect(typeof entry.handler).toBe('function');

    const manifest = registry.toManifest();
    expect(manifest.tools).toHaveLength(1);
    expect(manifest.tools[0].name).toBe('testTool');
    expect(manifest.tools[0].description).toBe('Test tool');
    expect(manifest.tools[0].inputSchema).toBeDefined();
  });

  it('cleans up registry entries when decorators are destroyed', () => {
    const registry = container.get(ToolRegistry);
    const controller = container.get(ToolController);

    expect(registry.list()).toHaveLength(1);

    destroyDecorators(controller as any, container);

    expect(registry.list()).toHaveLength(0);
  });

  it('uses custom name from options instead of property name', () => {
    class CustomNameController {
      @MCPTool({
        name: 'customToolName',
        description: 'Custom named tool',
      })
      public execute(): string {
        return 'ok';
      }
    }

    const customContainer = new Container();
    customContainer.bind(ToolRegistry);
    customContainer.bind(CustomNameController);
    initializeContainer(customContainer);

    const registry = customContainer.get(ToolRegistry);
    const entries = registry.list();

    expect(entries).toHaveLength(1);
    expect(entries[0].metadata.name).toBe('customToolName');
    expect(entries[0].metadata.description).toBe('Custom named tool');
  });

  it('preserves existing controller metadata when registering tools', () => {
    class MultiToolController {
      @MCPTool({
        name: 'firstTool',
        description: 'First tool',
      })
      public first(): string {
        return 'first';
      }

      @MCPTool({
        name: 'secondTool',
        description: 'Second tool',
      })
      public second(): string {
        return 'second';
      }
    }

    const multiContainer = new Container();
    multiContainer.bind(ToolRegistry);
    multiContainer.bind(MultiToolController);
    initializeContainer(multiContainer);

    const registry = multiContainer.get(ToolRegistry);
    const entries = registry.list();

    expect(entries).toHaveLength(2);
    expect(entries.find((e) => e.metadata.name === 'firstTool')).toBeDefined();
    expect(entries.find((e) => e.metadata.name === 'secondTool')).toBeDefined();
  });

  it('handles cleanup when metadata already exists', () => {
    class ExistingMetaController {
      @MCPTool({
        name: 'existingMetaTool',
        description: 'Tool with existing metadata',
      })
      public execute(): string {
        return 'ok';
      }
    }

    const existingContainer = new Container();
    existingContainer.bind(ToolRegistry);
    existingContainer.bind(ExistingMetaController);
    initializeContainer(existingContainer);

    const controller = existingContainer.get(ExistingMetaController);
    const registry = existingContainer.get(ToolRegistry);

    expect(registry.list()).toHaveLength(1);

    // This should clean up even when metadata exists
    destroyDecorators(controller as any, existingContainer);

    expect(registry.list()).toHaveLength(0);
  });

  it('uses property name when options name is not provided', () => {
    class DefaultNameController {
      @MCPTool({
        description: 'Tool with default name',
      })
      public myToolMethod(): string {
        return 'ok';
      }
    }

    const defaultContainer = new Container();
    defaultContainer.bind(ToolRegistry);
    defaultContainer.bind(DefaultNameController);
    initializeContainer(defaultContainer);

    const registry = defaultContainer.get(ToolRegistry);
    const entries = registry.list();

    expect(entries).toHaveLength(1);
    expect(entries[0].metadata.name).toBe('myToolMethod');
    expect(entries[0].metadata.description).toBe('Tool with default name');
  });

  it('handles cleanup when metadata.__meta does not exist', () => {
    class NoMetaController {
      @MCPTool({
        name: 'noMetaTool',
        description: 'Tool for testing missing metadata cleanup',
      })
      public execute(): string {
        return 'ok';
      }
    }

    const noMetaContainer = new Container();
    noMetaContainer.bind(ToolRegistry);
    noMetaContainer.bind(NoMetaController);
    initializeContainer(noMetaContainer);

    const controller = noMetaContainer.get(NoMetaController);
    const registry = noMetaContainer.get(ToolRegistry);

    // Manually clear __meta to test the branch where it doesn't exist
    const metadata = (controller as any).constructor.prototype;
    if (metadata.__meta) {
      delete metadata.__meta;
    }

    expect(registry.list()).toHaveLength(1);

    // This should handle cleanup gracefully even when __meta doesn't exist
    destroyDecorators(controller as any, noMetaContainer);

    expect(registry.list()).toHaveLength(0);
  });
});
