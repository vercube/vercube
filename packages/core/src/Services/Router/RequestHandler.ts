 
import { defineEventHandler, type EventHandler } from 'h3';
import { Container, Inject } from '@vercube/di';
import { MetadataResolver } from '../Metadata/MetadataResolver';
import { HttpError } from '../../Errors/HttpError';

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

    return defineEventHandler(async (event) => {

      // get the prototype of the instance to access the metadata
      const prototype = Object.getPrototypeOf(instance);

      // resolve metadata for the route
      const { args, actions, middlewares } = await this.gMetadataResolver.resolve(event, prototype, propertyName);

      // resolve middlewares
      const resolvedMiddlewares = middlewares.map((m) => ({
        ...m,
        middleware: this.gContainer.resolve(m.middleware),
      }));

      // get middlewares
      const beforeMiddlewares = resolvedMiddlewares.filter((m) => m.type === 'before');
      const afterMiddlewares = resolvedMiddlewares.filter((m) => m.type === 'after');

      // sort middlewares by priority
      beforeMiddlewares.sort((a, b) => (a?.priority ?? 999) - (b?.priority ?? 999));
      afterMiddlewares.sort((a, b) => (a?.priority ?? 999) - (b?.priority ?? 999));


      // call all actions like setting headers, etc.
      for (const action of actions) {
        action.handler(event.node.req, event.node.res);
      }

      // call before middlewares
      for (const middleware of beforeMiddlewares) {
        // call the middleware
        try {
          await middleware.middleware.use(event, middleware.args);
        } catch (error_) {
          // check if the error is known error type and return it.
          if (error_ instanceof HttpError) {
            event.node.res.statusCode = error_.status;
            return { ...error_ };
          }

          // if the middleware throws an error we stop the request and return the error
          event.node.res.statusCode = 500;
          return { status: 500, message: (error_ as Error)?.message ?? 'Internal server error' };
        }
      }

      let response = instance[propertyName].call(instance, args);

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