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

    return defineEventHandler((event) => {

      // get the prototype of the instance to access the metadata
      const prototype = Object.getPrototypeOf(instance);

      // resolve metadata for the route
      const metadata = this.gMetadataResolver.resolve(event, prototype.__metadata[propertyName]);

      // call all actions like setting headers, etc.
      for (const action of metadata.actions) {
        action.handler(event.node.req, event.node.res);
      }

      // call the route handler method
      return instance[propertyName].call(instance, []);
    });
  }

}