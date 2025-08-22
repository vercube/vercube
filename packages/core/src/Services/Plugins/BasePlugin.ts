/* eslint-disable @typescript-eslint/no-unused-vars */
import type { App } from '../../Common/App';

/**
 * Represents a Plugin.
 */
export class BasePlugin<T = unknown> {

  /**
   * The name of the plugin.
   */
  public name: string;

  /**
   * Uses the plugin with the given app.
   * @param {App} app - The application instance.
   * @returns {void | Promise<void>} - A void or a promise that resolves to void.
   */
  public use(app: App, options?: T): void | Promise<void> {}

}