import { Controller, Get, Middleware, Post, RequestContextService, Status } from '@vercube/core';
import { Inject } from '@vercube/di';
import { Logger } from '@vercube/logger';
import { RequestContextMiddleware } from '../Middlewares/RequestContextMiddleware';

/**
 * Controller demonstrating the usage of Request Context.
 * This controller shows how to use RequestContextService to access
 * request-specific data stored in the context by middleware.
 */
@Controller('/api/request-context')
@Middleware(RequestContextMiddleware)
export class RequestContextController {
  @Inject(Logger)
  private gLogger!: Logger;

  @Inject(RequestContextService)
  private gRequestContextService!: RequestContextService;

  /**
   * Example endpoint that retrieves user ID from request context.
   * The user ID is set by RequestContextMiddleware based on the bearer token.
   * Uses RequestContextService.get() to retrieve the value.
   *
   * @returns User information
   */
  @Get('/user')
  public async getUser(): Promise<{
    userId: string | undefined;
    message: string;
  }> {
    const userId = this.gRequestContextService.get<string>('userId');

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
   * Uses RequestContextService.get() to retrieve the value.
   *
   * @returns Token information (without exposing the full token for security)
   */
  @Get('/token')
  public async getToken(): Promise<{
    tokenPrefix: string;
    message: string;
  }> {
    const token = this.gRequestContextService.get<string>('bearerToken');

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
   * Shows how to use RequestContextService directly in the handler.
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
    const requestId = this.gRequestContextService.get<string>('requestId');
    const requestMethod = this.gRequestContextService.get<string>('requestMethod');
    const requestUrl = this.gRequestContextService.get<string>('requestUrl');
    const requestStartTime = this.gRequestContextService.get<number>('requestStartTime');
    const allKeys = this.gRequestContextService.keys();

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
    const userId = this.gRequestContextService.getOrDefault<string>('userId', 'guest');

    return {
      userId,
      message: `User ID: ${userId} (default value used if not found in context)`,
    };
  }

  /**
   * Example endpoint that demonstrates setting values in context from the handler.
   * This shows that you can modify context during request processing using RequestContextService.set().
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
    this.gRequestContextService.set('customValue', customValue);

    // This value is now available for other parts of the request processing
    const retrievedValue = this.gRequestContextService.get<string>('customValue');

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
    const allContext = this.gRequestContextService.getAll();
    const keys = this.gRequestContextService.keys();

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
    const requestId = this.gRequestContextService.get<string>('requestId');

    return {
      requestId,
      message: `This request has its own isolated context with requestId: ${requestId}`,
    };
  }
}
