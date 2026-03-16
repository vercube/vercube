import { Controller, Get, Middleware, Post, Status } from '@vercube/core';
import { Inject } from '@vercube/di';
import { Logger } from '@vercube/logger';
import { RequestContextMiddleware } from '../Middlewares/RequestContextMiddleware';
import {
  BearerTokenKey,
  CustomValueKey,
  RequestIdKey,
  RequestMethodKey,
  RequestStartTimeKey,
  RequestUrlKey,
  UserIdKey,
} from '../Services/RequestContextKeys';
import { TypedRequestContext } from '../Services/TypedRequestContext';

/**
 * Controller demonstrating the usage of Request Context.
 * This controller shows how to use RequestContext to access
 * request-specific data stored in the context by middleware.
 */
@Controller('/api/request-context')
@Middleware(RequestContextMiddleware)
export class RequestContextController {
  /**
   * The logger instance.
   */
  @Inject(Logger)
  private gLogger!: Logger;

  /**
   * The typed request context instance.
   */
  @Inject(TypedRequestContext)
  private gTypedRequestContext!: TypedRequestContext;

  /**
   * Example endpoint that retrieves user ID from request context.
   * The user ID is set by RequestContextMiddleware based on the bearer token.
   * Uses RequestContext.get() to retrieve the value.
   *
   * @returns User information
   */
  @Get('/user')
  public async getUser(): Promise<{
    userId: string | undefined;
    message: string;
  }> {
    const userId = this.gTypedRequestContext.get(UserIdKey);

    this.gLogger.info('RequestContextController::getUser', `User ID from context: ${userId}`);

    if (!userId) {
      return {
        userId: undefined,
        message: 'No user ID found in context. Make sure to include Authorization header with Bearer token.',
      };
    }

    return {
      userId,
      message: `User ID retrieved from request context: ${userId}`,
    };
  }

  /**
   * Example endpoint that retrieves bearer token from request context.
   * Uses RequestContext.get() to retrieve the value.
   *
   * @returns Token information (without exposing the full token for security)
   */
  @Get('/token')
  public async getToken(): Promise<{
    tokenPrefix: string;
    message: string;
  }> {
    const token = this.gTypedRequestContext.get(BearerTokenKey);

    if (!token) {
      return {
        tokenPrefix: 'none',
        message: 'No bearer token found in context. Include Authorization header with Bearer token.',
      };
    }

    // Only show first few characters for security
    const tokenPrefix = token.slice(0, 10) + '...';

    return {
      tokenPrefix,
      message: 'Bearer token retrieved from request context (partial display for security)',
    };
  }

  /**
   * Example endpoint that retrieves multiple values from request context.
   * Shows how to use RequestContext directly in the handler.
   *
   * @returns Request metadata from context
   */
  @Get('/metadata')
  public async getMetadata(): Promise<{
    requestId: string | undefined;
    requestMethod: string | undefined;
    requestUrl: string | undefined;
    requestStartTime: number | undefined;
    processingTime: number | undefined;
    allKeys: string[];
  }> {
    const requestId = this.gTypedRequestContext.get(RequestIdKey);
    const requestMethod = this.gTypedRequestContext.get(RequestMethodKey);
    const requestUrl = this.gTypedRequestContext.get(RequestUrlKey);
    const requestStartTime = this.gTypedRequestContext.get(RequestStartTimeKey);
    const allKeys = this.gTypedRequestContext.keys();

    const processingTime = requestStartTime ? Date.now() - requestStartTime : undefined;

    this.gLogger.info('RequestContextController::getMetadata', {
      requestId,
      requestMethod,
      requestUrl,
      processingTime,
    });

    return {
      requestId,
      requestMethod,
      requestUrl,
      requestStartTime,
      processingTime,
      allKeys,
    };
  }

  /**
   * Example endpoint that uses default value when key is not found in context.
   *
   * @returns User information
   */
  @Get('/user-with-default')
  public async getUserWithDefault(): Promise<{
    userId: string;
    message: string;
  }> {
    const userId = this.gTypedRequestContext.getOrDefault(UserIdKey, 'guest');

    return {
      userId,
      message: `User ID: ${userId} (default value used if not found in context)`,
    };
  }

  /**
   * Example endpoint that demonstrates setting values in context from the handler.
   * This shows that you can modify context during request processing using RequestContext.set().
   *
   * @returns Information about the operation
   */
  @Post('/set-custom-value')
  public async setCustomValue(): Promise<{
    message: string;
    customValue: string;
  }> {
    // Set a custom value in the context
    const customValue = `custom-${Date.now()}`;
    this.gTypedRequestContext.set(CustomValueKey, customValue);

    // This value is now available for other parts of the request processing
    const retrievedValue = this.gTypedRequestContext.get(CustomValueKey);

    this.gLogger.info('RequestContextController::setCustomValue', `Set custom value: ${retrievedValue}`);

    return {
      message: 'Custom value set in request context',
      customValue: retrievedValue!,
    };
  }

  /**
   * Example endpoint that retrieves all context values.
   * Useful for debugging and understanding what's stored in the context.
   *
   * @returns All key-value pairs from the context
   */
  @Get('/all')
  @Status(200)
  public async getAllContext(): Promise<{
    context: Record<string, unknown>;
    keys: string[];
    message: string;
  }> {
    const allContext = this.gTypedRequestContext.getAll();
    const keys = this.gTypedRequestContext.keys();

    // Convert Map to object for JSON serialization
    const contextObject: Record<string, unknown> = {};
    for (const [key, value] of allContext.entries()) {
      contextObject[key] = value;
    }

    return {
      context: contextObject,
      keys,
      message: 'All values from request context',
    };
  }

  /**
   * Example endpoint that demonstrates context isolation.
   * Each request gets its own isolated context.
   *
   * @returns Request-specific information
   */
  @Get('/isolated')
  public async getIsolatedContext(): Promise<{
    requestId: string | undefined;
    message: string;
  }> {
    const requestId = this.gTypedRequestContext.get(RequestIdKey);

    return {
      requestId,
      message: `This request has its own isolated context with requestId: ${requestId}`,
    };
  }
}
