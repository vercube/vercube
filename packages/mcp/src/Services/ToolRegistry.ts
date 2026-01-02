import type { MCPTypes } from '../Types/MCPTypes';

/**
 * ToolRegistry for MCP tool controllers
 *
 * Maintains a live registry of MCP tool entries for runtime lookup, tool execution,
 * and publishable tool manifests. Supports registration and unregistration of tools,
 * event-driven subscriptions for reactive updates, and produces manifest output
 * for documentation, discovery, or interop.
 */
export class ToolRegistry {
  /**
   * Internal set of registered tool entries (controller/tool pairs).
   */
  private readonly fEntries: Set<MCPTypes.ToolRegistryEntry> = new Set();
  /**
   * Internal set of listeners for subscription notifications.
   */
  private readonly fListeners: Set<(entries: MCPTypes.ToolRegistryEntry[]) => void> = new Set();

  /**
   * Registers a tool (replacing any previous instance for the same controller/property).
   * Notifies all listeners of the updated registry.
   *
   * @param {MCPTypes.ToolRegistryEntry} entry - The tool entry to add
   */
  public register(entry: MCPTypes.ToolRegistryEntry): void {
    this.unregister(entry.controller, entry.propertyKey);
    this.fEntries.add(entry);
    this.notify();
  }

  /**
   * Unregisters a tool by controller and property name.
   * Notifies listeners if removal occurs.
   *
   * @param {unknown} controller - The controller instance
   * @param {string} propertyKey - The property or method name of the tool
   */
  public unregister(controller: unknown, propertyKey: string): void {
    for (const existingEntry of this.fEntries) {
      if (existingEntry.controller === controller && existingEntry.propertyKey === propertyKey) {
        this.fEntries.delete(existingEntry);
        this.notify();
        break;
      }
    }
  }

  /**
   * Returns a shallow list of all currently registered tool entries.
   *
   * @returns {MCPTypes.ToolRegistryEntry[]} The registered tools
   */
  public list(): MCPTypes.ToolRegistryEntry[] {
    return [...this.fEntries];
  }

  /**
   * Subscribes to registry changes, receiving the current tool list immediately and all future updates.
   * Returns an unsubscribe function to remove the listener.
   *
   * @param {(entries: MCPTypes.ToolRegistryEntry[]) => void} listener - Called on every registry change
   * @returns {() => void} Unsubscribe callback
   */
  public subscribe(listener: (entries: MCPTypes.ToolRegistryEntry[]) => void): () => void {
    this.fListeners.add(listener);
    listener(this.list());

    return () => {
      this.fListeners.delete(listener);
    };
  }

  /**
   * Produces a manifest listing all currently registered tools, for discovery/interop.
   *
   * @returns {MCPTypes.ToolManifest} Manifest with summarized tool metadata
   */
  public toManifest(): MCPTypes.ToolManifest {
    return {
      tools: this.list().map(({ metadata }) => ({
        name: metadata.name,
        description: metadata.description,
        inputSchema: metadata.inputSchema,
        outputSchema: metadata.outputSchema,
      })),
    };
  }

  /**
   * Notifies all registered listeners of the updated tool list.
   * Called after every registry mutation.
   */
  private notify(): void {
    const entries = this.list();

    for (const listener of this.fListeners) {
      listener(entries);
    }
  }
}
