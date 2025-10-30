import { initializeMetadata, initializeMetadataMethod } from '@vercube/core';
import { BaseDecorator, createDecorator, Inject } from '@vercube/di';
import { ToolRegistry } from '../Services/ToolRegistry';
import type { MCPTypes } from '../Types/MCPTypes';

/**
 * Options for configuring the MCPTool decorator.
 * Allows definition of tool metadata partially overriding the default values.
 */
export type MCPToolDecoratorOptions = Partial<MCPTypes.ToolMetadata>;

/**
 * A decorator class for registering tool methods with the MCP ToolRegistry.
 *
 * This class extends BaseDecorator and is used to collect and register tool-related metadata
 * and link decorated controller methods with the ToolRegistry.
 * Also handles deregistration and metadata cleanup on destruction.
 *
 * @extends {BaseDecorator<MCPToolDecoratorOptions>}
 */
class MCPToolDecorator extends BaseDecorator<MCPToolDecoratorOptions> {
  /**
   * The registry that manages available tools and their handlers.
   */
  @Inject(ToolRegistry)
  private readonly gToolRegistry!: ToolRegistry;

  /**
   * Called when the decorator is created.
   *
   * Collects tool metadata, attaches it to method/controller, and registers the tool handler.
   */
  public override created(): void {
    const metadata = initializeMetadata(this.prototype);
    const method = initializeMetadataMethod(this.prototype, this.propertyName);

    const toolMetadata: MCPTypes.ToolMetadata = {
      name: this.options?.name ?? this.propertyName,
      description: this.options?.description,
      inputSchema: this.options?.inputSchema,
      outputSchema: this.options?.outputSchema,
      annotations: this.options?.annotations,
    };

    method.meta = {
      ...method.meta,
      mcpTool: toolMetadata,
    };

    const controllerMeta = (metadata.__meta ?? {}) as {
      mcpTools?: Record<string, MCPTypes.ToolMetadata>;
      [key: string]: unknown;
    };

    const existingTools = controllerMeta.mcpTools ?? {};

    metadata.__meta = {
      ...controllerMeta,
      mcpTools: {
        ...existingTools,
        [this.propertyName]: toolMetadata,
      },
    };

    this.gToolRegistry.register({
      controller: this.instance,
      propertyKey: this.propertyName,
      handler: this.instance[this.propertyName].bind(this.instance),
      metadata: toolMetadata,
    });
  }

  /**
   * Called when the decorator is destroyed.
   *
   * Cleans up method and controller tool metadata and unregisters the tool handler from the registry.
   */
  public override destroyed(): void {
    const metadata = initializeMetadata(this.prototype);
    const method = initializeMetadataMethod(this.prototype, this.propertyName);

    // Clean up method metadata
    if (method.meta?.mcpTool) {
      delete method.meta.mcpTool;
    }

    // Clean up controller metadata
    const controllerMeta = (metadata.__meta ?? {}) as {
      mcpTools?: Record<string, MCPTypes.ToolMetadata>;
      [key: string]: unknown;
    };

    if (controllerMeta.mcpTools && controllerMeta.mcpTools[this.propertyName]) {
      delete controllerMeta.mcpTools[this.propertyName];
    }

    // Unregister from the tool registry
    this.gToolRegistry.unregister(this.instance, this.propertyName);
  }
}

/**
 * Decorator function for registering a tool method with the MCP ToolRegistry.
 *
 * Applies the MCPToolDecorator to the target method with the specified parameters.
 *
 * @param {MCPToolDecoratorOptions} params - Metadata and options for the tool.
 * @returns {Function} - The decorator function to apply.
 */
export function MCPTool(params: MCPToolDecoratorOptions): Function {
  return createDecorator(MCPToolDecorator, params);
}
