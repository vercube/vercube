// oxlint-disable no-empty-object-type
import type { RequestHandlerExtra } from '@modelcontextprotocol/sdk/shared/protocol.js';
import type { ServerNotification, ServerRequest } from '@modelcontextprotocol/sdk/types.js';
import type { MaybePromise } from '@vercube/core';

/**
 * Abstract base class for MCP tools.
 *
 * @typeParam TArgs - Zod raw shape describing the expected arguments schema
 * for the tool. Implementations should validate incoming
 * arguments against this shape.
 * TODO: change this to proper type after modulecontextprotocol/sdk is updated to use zod v4
 */
export abstract class Tool<TArgs = any, TOutput = any> {
  /**
   * Execute the tool's logic.
   *
   * @param args - Parsed and validated arguments matching {@link TArgs}
   * @param extra - MCP request context and helpers for handling requests/notifications
   * @returns The tool result, possibly asynchronously
   */
  public abstract execute(args: TArgs, extra?: RequestHandlerExtra<ServerRequest, ServerNotification>): MaybePromise<TOutput>;
}
