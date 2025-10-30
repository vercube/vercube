import { App, BasePlugin } from '@vercube/core';
import { MCPController } from '../Controllers/MCPController';
import { MCPHttpHandler } from '../Services/MCPHttpHandler';
import { ToolRegistry } from '../Services/ToolRegistry';

/**
 * MCP Plugin for Vercube framework
 *
 * Provides MCP API endpoints and tool registry integration:
 * - Registers MCP HTTP controllers and supporting services
 * - Enables tool registration and dynamic request handling
 * - Pluggable via app.addPlugin(MCPPlugin) in Vercube apps
 *
 * @example
 * ```ts
 * import { createApp } from '@vercube/core';
 * import { MCPPlugin } from '@vercube/mcp';
 *
 * const app = createApp({
 *   setup: async (app) => {
 *     app.addPlugin(MCPPlugin);
 *   }
 * });
 * ```
 *
 * @see {@link https://vercube.dev} for full documentation
 */
export class MCPPlugin<T = unknown> extends BasePlugin<T> {
  /**
   * The name of the plugin.
   * @override
   */
  public override name: string = 'MCPPlugin';

  /**
   * Method to use the plugin with the given app.
   *
   * Binds required MCP services and controller to the app container.
   *
   * @param {App} app - The application instance.
   * @param {T} _options - Plugin options (currently unused).
   * @returns {void}
   * @override
   */
  public override use(app: App, _options: T): void {
    app.container.bind(ToolRegistry);
    app.container.bind(MCPHttpHandler);
    app.container.bind(MCPController);
  }
}
