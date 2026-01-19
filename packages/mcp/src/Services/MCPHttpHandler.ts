import { Inject } from '@vercube/di';
import { Logger } from '@vercube/logger';
import { createMcpHandler } from 'mcp-handler';
import type { MCPTypes } from '../Types/MCPTypes';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { RequestHandlerExtra } from '@modelcontextprotocol/sdk/shared/protocol.js';
import type { CallToolResult, ServerNotification, ServerRequest } from '@modelcontextprotocol/sdk/types.js';
import type { z } from 'zod/v3';
import { version } from '../../package.json';
import { ToolRegistry } from './ToolRegistry';

/**
 * HTTP request handler for the Model Context Protocol (MCP).
 *
 * This service manages the lifecycle of an MCP server instance, coordinates tool registration
 * from the ToolRegistry, and processes incoming HTTP requests by creating transport adapters
 * and delegating to the underlying MCP server.
 */
export class MCPHttpHandler {
  /**
   * Registry containing all registered MCP tools.
   * @private
   */
  @Inject(ToolRegistry)
  private readonly gToolRegistry!: ToolRegistry;

  /**
   * Logger instance for diagnostic and debugging information.
   * @private
   */
  @Inject(Logger)
  private readonly gLogger!: Logger;

  /**
   * Unsubscribe function for tool registry changes.
   * @private
   */
  private fSubscription?: () => void;

  /**
   * Cached snapshot of tool registry entries.
   * @private
   */
  private fEntries: MCPTypes.ToolRegistryEntry[] = [];

  /**
   * Handler function for the MCP protocol.
   * @private
   */
  private fHandler?: (request: Request) => Promise<Response>;

  /**
   * Processes an incoming HTTP request through the MCP protocol.
   *
   * This method ensures the tool registry subscription is active, then creates or reuses
   * a cached MCP handler function to process the request. The handler manages the complete
   * MCP protocol flow including transport setup, request routing, and response formatting.
   *
   * The handler is created once and cached for performance. It will use the current snapshot
   * of registered tools from the tool registry.
   *
   * @param request - The incoming HTTP request conforming to the Fetch API Request interface
   * @returns A Promise resolving to an HTTP Response containing the MCP protocol response
   */
  public async handleRequest(request: Request): Promise<Response | undefined> {
    this.ensureSubscription();

    if (!this.fHandler) {
      this.fHandler = this.createHandler();
    }

    return this.fHandler(request);
  }

  /**
   * Ensures an active subscription to tool registry changes.
   *
   * This method implements a lazy subscription pattern where on the first call, it captures the
   * current tool entries and subscribes to future changes. The subscription callback updates the
   * cached entries array which will be used when the handler is next created.
   *
   * Note: Changes to the tool registry will not affect an already-created handler. The handler
   * must be recreated (by clearing the cache) to pick up new tools.
   *
   * @private
   */
  private ensureSubscription(): void {
    if (this.fSubscription) return;
    this.fEntries = this.gToolRegistry.list();
    this.fSubscription = this.gToolRegistry.subscribe((entries) => {
      this.fEntries = entries;
    });
  }

  /**
   * Extracts the shape from a Zod schema if it's a ZodObject.
   * Returns undefined if the schema is not a ZodObject.
   *
   * @param schema - The Zod schema to extract shape from
   * @returns The shape of the ZodObject or undefined
   * @private
   */
  private getSchemaShape(schema: any): z.ZodRawShape | undefined {
    return 'shape' in schema ? schema.shape : undefined;
  }

  /**
   * Creates an MCP request handler function with all current tools registered.
   *
   * This method uses `createMcpHandler` from the mcp-handler package to create a request handler
   * that manages the MCP server lifecycle internally. During initialization, it iterates through
   * all cached tool registry entries and registers each tool with its metadata including description,
   * input/output schemas, and annotations.
   *
   * Tool handlers are wrapped to provide consistent behavior where they receive validated args
   * (based on inputSchema) and extra context. Return values are normalized to the MCP CallToolResult
   * format - if the handler returns a proper result structure, it's passed through unchanged,
   * otherwise the result is wrapped in a text content block. Errors are caught and returned as
   * MCP error responses with isError set to true.
   *
   * The method supports Zod schemas for validating and parsing tool arguments (inputSchema) and
   * return values (outputSchema), as well as additional metadata through annotations such as
   * readOnlyHint and destructiveHint.
   *
   * @returns A handler function that processes MCP requests and returns responses
   * @private
   */
  private createHandler(): (request: Request) => Promise<Response> {
    const handler = createMcpHandler(
      (server: McpServer) => {
        for (const entry of this.fEntries) {
          const { name, description, inputSchema, outputSchema, annotations } = entry.metadata;

          server.registerTool(
            name,
            {
              description: description ?? 'Vercube MCP tool',
              inputSchema: inputSchema ? this.getSchemaShape(inputSchema) : undefined,
              outputSchema: outputSchema ? this.getSchemaShape(outputSchema) : undefined,
              annotations,
            },
            async (args: unknown, _extra: RequestHandlerExtra<ServerRequest, ServerNotification>): Promise<CallToolResult> => {
              try {
                const result = await entry.handler(args, _extra);

                if (this.isValidCallToolResult(result)) {
                  return result;
                }

                return {
                  content: [{ type: 'text', text: typeof result === 'string' ? result : JSON.stringify(result) }],
                  structuredContent: outputSchema ? (result as z.infer<typeof outputSchema>) : undefined,
                };
              } catch (error) {
                return {
                  content: [
                    {
                      type: 'text',
                      text: `Error: ${this.formatError(error)}`,
                    },
                  ],
                  isError: true,
                };
              }
            },
          );
        }
      },
      { serverInfo: { name: '@vercube/mcp', version } },
      { verboseLogs: false, streamableHttpEndpoint: '/api/mcp' },
    );

    return handler;
  }

  /**
   * Checks if a result conforms to the CallToolResult interface.
   *
   * @param result - The value to check
   * @returns True if the result has content or structuredContent properties
   * @private
   */
  private isValidCallToolResult(result: unknown): result is CallToolResult {
    return result !== null && typeof result === 'object' && ('content' in result || 'structuredContent' in result);
  }

  /**
   * Formats an error into a human-readable string.
   *
   * @param error - The error to format (Error, string, or unknown)
   * @returns A formatted error message
   * @private
   */
  private formatError(error: unknown): string {
    if (error instanceof Error) {
      return error.message;
    }
    if (typeof error === 'string') {
      return error;
    }
    if (error && typeof error === 'object' && 'toString' in error) {
      return String(error);
    }
    return 'Unknown error';
  }
}
