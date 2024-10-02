/* eslint-disable @typescript-eslint/no-explicit-any */
import { defineEventHandler, type EventHandler } from 'h3';
import { Inject } from '@cube/di';
import { MetadataResolver } from '../Metadata/MetadataResolver';

/**
 * Options for the RequestHandler.
 * @interface
 */
export interface RequestHandlerOptions {
  instance: any;
  propertyName: string;
}

/**
 * Handles incoming requests by resolving metadata and invoking the appropriate handler method.
 * @class
 */
export class RequestHandler {

  /**
   * Resolver for metadata associated with routes.
   * @type {MetadataResolver}
   * @private
   */
  @Inject(MetadataResolver)
  private gMetadataResolver!: MetadataResolver;

  /**
   * Handles an incoming request.
   * @param {RequestHandlerOptions} params - The options for handling the request.
   * @returns {EventHandler} The event handler for the request.
   */
  public handleRequest(params: RequestHandlerOptions): EventHandler {
    const { instance, propertyName } = params;

    return defineEventHandler(async (event) => {

      // get the prototype of the instance to access the metadata
      const prototype = Object.getPrototypeOf(instance);

      // resolve metadata for the route
      const { actions, middlewares } = this.gMetadataResolver.resolve(event, prototype.__metadata[propertyName]);

      // get middlewares
      const beforeMiddlewares = middlewares.filter((m) => m.type === 'before');
      const afterMiddlewares = middlewares.filter((m) => m.type === 'after');

      // sort middlewares by priority
      beforeMiddlewares.sort((a, b) => (a?.priority ?? 999) - (b?.priority ?? 999));
      afterMiddlewares.sort((a, b) => (a?.priority ?? 999) - (b?.priority ?? 999));


      // call all actions like setting headers, etc.
      for (const action of actions) {
        action.handler(event.node.req, event.node.res);
      }

      // call before middlewares
      for (const middleware of beforeMiddlewares) {
        await middleware.middleware.use(event);
      }

      let response = instance[propertyName].call(instance, []);

      if (response instanceof Promise) {
        response = await response;
      }

      // call after middlewares
      for (const middleware of afterMiddlewares) {
        await middleware.middleware.use(event);
      }

      // call the route handler method
      return response;
    });
  }

}