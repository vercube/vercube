import { BasePlugin } from '@vercube/core';
import { WebsocketService } from '../Services/WebsocketService';
import { $WebsocketService } from '../Symbols/WebsocketSymbols';
import type { App } from '@vercube/core';

/**
 * Websocket Plugin for Vercube framework
 *
 * Enables websocket connections and use of decorators related
 * to the Websocket package.
 *
 * @example
 * ```ts
 * import { createApp } from '@vercube/core';
 * import { WebsocketPlugin } from '@vercube/ws';
 *
 * const app = createApp({
 *   setup: async (app) => {
 *     app.addPlugin(WebsocketPlugin);
 *   }
 * });
 * ```
 *
 * @see {@link https://vercube.dev} for full documentation
 */
export class WebsocketPlugin<T = unknown> extends BasePlugin<T> {
  /**
   * The name of the plugin.
   * @override
   */
  public override name: string = 'WebsocketPlugin';

  /**
   * Method to use the plugin with the given app.
   * @param {App} app - The application instance.
   * @returns {void | Promise<void>}
   * @override
   */
  public override use(app: App, options: T): void | Promise<void> {
    // bind and initialize the websocket service
    app.container.bind($WebsocketService, WebsocketService);
    app.container.get<WebsocketService>($WebsocketService).initialize();
  }
}
