/* eslint-disable @typescript-eslint/no-empty-object-type */
import { MetadataTypes } from '../../Types/MetadataTypes';
import { BaseMiddleware } from './BaseMiddleware';

interface GlobalMiddlewareParams<T> extends Omit<MetadataTypes.Middleware<T>, 'middleware'> {}

interface GlobalMiddlewareStorageItem<T = unknown, U = unknown> {
  middleware: typeof BaseMiddleware<T, U>;
  opts?: GlobalMiddlewareParams<T>;
}

/**
 * Manages global middleware registration and retrieval
 *
 * This class provides functionality to register and retrieve global middleware
 * configurations. It allows for adding middleware with specific options and
 * retrieving them in a standardized format.
 */
export class GlobalMiddlewareRegistry {
  private fMiddlewares: Set<GlobalMiddlewareStorageItem> = new Set();

  /**
   * Retrieves all registered global middleware configurations
   *
   * @returns {MetadataTypes.Middleware[]} An array of middleware configurations
   */
  public get middlewares(): MetadataTypes.Middleware[] {
    return [...this.fMiddlewares.values()].map((m) => ({
      ...m.opts,
      target: '__global__',
      middleware: m.middleware,
    }));
  }

  /**
   * Registers a global middleware configuration
   *
   * @param {typeof BaseMiddleware<T, U>} middleware - The middleware class to register
   * @param {GlobalMiddlewareParams<T>} opts - The middleware options
   * @returns {void}
   */
  public registerGlobalMiddleware<T = unknown, U = unknown>(
    middleware: typeof BaseMiddleware<T, U>,
    opts?: GlobalMiddlewareParams<T>,
  ): void {
    this.fMiddlewares.add({
      middleware,
      opts,
    });
  }
}
