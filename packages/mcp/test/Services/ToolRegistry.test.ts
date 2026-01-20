import { describe, expect, it, vi } from 'vitest';
import { ToolRegistry } from '../../src/Services/ToolRegistry';
import type { MCPTypes } from '../../src/Types/MCPTypes';

describe('ToolRegistry', () => {
  it('notifies subscribers on register and unregister events', () => {
    const registry = new ToolRegistry();
    const snapshots: MCPTypes.ToolRegistryEntry[][] = [];
    const unsubscribe = registry.subscribe((entries) => {
      snapshots.push(entries);
    });

    const controller = {};
    const entry: MCPTypes.ToolRegistryEntry = {
      controller,
      propertyKey: 'run',
      handler: vi.fn(),
      metadata: {
        name: 'run',
      },
    };

    registry.register(entry);
    registry.unregister(controller, 'run');
    unsubscribe();

    expect(snapshots).toHaveLength(3);
    expect(snapshots[0]).toHaveLength(0);
    expect(snapshots[1]).toHaveLength(1);
    expect(snapshots[2]).toHaveLength(0);
  });
});
