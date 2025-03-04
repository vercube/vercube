import { defineEventHandler, type EventHandler } from 'h3';
import { Container, Inject } from '@vercube/di';
import { MetadataResolver } from '../Metadata/MetadataResolver';
import { AfterMiddleware, BeforeMiddleware, HttpEvent } from '@vercube/core';

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
   * Container for dependency injection.
   * @type {Container}
   * @private
   */
  @Inject(Container)
  private gContainer!: Container;

  /**
   * Handles an incoming request.
   * @param {RequestHandlerOptions} params - The options for handling the request.
   * @returns {EventHandler} The event handler for the request.
   */
  public handleRequest(params: RequestHandlerOptions): EventHandler {
    const { instance, propertyName } = params;

    // get the prototype of the instance to access the metadata
    const prototype = Object.getPrototypeOf(instance);

    // get method metadata
    const method = this.gMetadataResolver.resolveMethod(prototype, propertyName);

    // get middlewares
    const middlewares = this.gMetadataResolver.resolveMiddlewares(prototype, propertyName);

    // get unique middlewares;
    const uniqueMiddlewares = middlewares
      .filter((m, index, self) => self.findIndex((t) => t.middleware === m.middleware) === index);

    // resolve middlewares
    const resolvedMiddlewares = uniqueMiddlewares.map((m) => ({
        ...m,
        middleware: this.gContainer.resolve(m.middleware),
      }));

    // get middleware types
    const beforeMiddlewares = resolvedMiddlewares.filter((m) => m.type === 'before');
    const afterMiddlewares = resolvedMiddlewares.filter((m) => m.type === 'after');

    // sort middlewares by priority
    beforeMiddlewares.sort((a, b) => (a?.priority ?? 999) - (b?.priority ?? 999));
    afterMiddlewares.sort((a, b) => (a?.priority ?? 999) - (b?.priority ?? 999));

    return defineEventHandler({
      onRequest: beforeMiddlewares.map(middleware => {
        return async (event: HttpEvent) => {
          const args = await this.gMetadataResolver.resolveArgs(method.args, event);
          (middleware.middleware as BeforeMiddleware).onRequest(event, { middlewareArgs: middleware.args, methodArgs: args });
        };
      }),
      handler: async (event: HttpEvent) => {
        const actions = method.actions;

        // call all actions like setting headers, etc.
        for (const action of actions) {
          const actionResult = action.handler(event.node.req, event.node.res);

          if (actionResult != null) {
            return actionResult;
          }
        }

        const args = await this.gMetadataResolver.resolveArgs(method.args, event);
        let response = instance[propertyName].call(instance, ...args?.map((a) => a.resolved) ?? []);

        if (response instanceof Promise) {
          response = await response;
        }

        return response;
      },
      onBeforeResponse: afterMiddlewares.map(middleware => {
        return async (event: HttpEvent, response) => {
          // call after middleware
          await (middleware.middleware as AfterMiddleware).onResponse(event, response);
        };
      }),
    });
  }

}
