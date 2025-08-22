/* eslint-disable @typescript-eslint/no-unused-vars */
import { App, BasePlugin } from '@vercube/core';

export interface CustomPluginOptions {
  foo: string;
}

/**
 * CustomPlugin class that extends the Plugin class.
 */
export class CustomPlugin extends BasePlugin<CustomPluginOptions> {
  /**
   * The name of the plugin.
   * @override
   */
  public override name: string = 'CustomPlugin';

  /**
   * Method to use the plugin with the given app.
   * @param {App} app - The application instance.
   * @returns {void | Promise<void>}
   * @override
   */
  public override use(
    app: App,
    options: CustomPluginOptions,
  ): void | Promise<void> {}
}
