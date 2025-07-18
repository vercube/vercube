import { z } from 'zod';
import { extendZodWithOpenApi } from '@asteasolutions/zod-to-openapi';
import { type App, BasePlugin } from '@vercube/core';
import { SchemaRegistry } from '../Services/SchemaRegistry';
import { SchemaController } from '../Controllers/SchameController';

// extends ZOD schema
extendZodWithOpenApi(z);

export class SchemaPlugin<T = unknown> extends BasePlugin<T> {

  /**
   * The name of the plugin.
   * @override
   */
  public override name: string = 'SchemaPlugin';

  /**
   * Method to use the plugin with the given app.
   * @param {App} app - The application instance.
   * @returns {void | Promise<void>}
   * @override
   */
  public override use(app: App, options: T): void | Promise<void> {
    // bind required services to the app container
    app.container.bind(SchemaRegistry);

    // bind schema controller to the app container
    app.container.bind(SchemaController);
  }

}