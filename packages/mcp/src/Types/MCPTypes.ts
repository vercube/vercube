import type { ToolAnnotations } from '@modelcontextprotocol/sdk/types.js';

/**
 * Types and interfaces used for MCP tool registration and manifest generation.
 *
 * Defines metadata and registry structure for integrating tools in the MCP framework.
 * Used for controller method decoration, dynamic discovery, and manifest output.
 */
export namespace MCPTypes {
  /**
   * Metadata describing a tool handled by the MCP system.
   *
   * Used for manifest, documentation, and validation. Optionally allows
   * specifying input/output schemas for structured tool contracts.
   */
  export interface ToolMetadata {
    /**
     * Name of the tool (method/property name by default).
     */
    name: string;
    /**
     * Optional human-readable description of the tool's purpose or functionality.
     */
    description?: string;
    /**
     * Optional input schema definition (can be any structured type, e.g., Zod or JSON Schema).
     * TODO: change this to proper type after modulecontextprotocol/sdk is updated to use zod v4
     */
    inputSchema?: any;

    /**
     * Optional output schema definition (can be any structured type, e.g., Zod or JSON Schema).
     * TODO: change this to proper type after modulecontextprotocol/sdk is updated to use zod v4
     */
    outputSchema?: any;

    /**
     * Optional annotations for the tool.
     */
    annotations?: ToolAnnotations;
  }

  /**
   * Entry describing a registered tool in the ToolRegistry.
   *
   * Associates tool metadata and handler with the controller and decorated method.
   */
  export interface ToolRegistryEntry {
    /** The controller instance containing the tool. */
    controller: unknown;
    /** The name of the property or method providing the tool. */
    propertyKey: string;
    /** Bound method handler for executing the tool. */
    handler: (...args: unknown[]) => unknown | Promise<unknown>;
    /** The metadata describing the tool. */
    metadata: ToolMetadata;
  }

  /**
   * Tool manifest structure for publishing or exporting all registered tools.
   * Used for OpenAPI-like endpoint or discovery documents.
   */
  export interface ToolManifest {
    /** The array of registered tools and their metadata. */
    tools: ToolManifestTool[];
  }

  /**
   * Alias for per-tool metadata inside the manifest.
   */
  export type ToolManifestTool = ToolMetadata;
}
