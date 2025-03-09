/**
 * Abstract class representing an error handler provider
 * Provides a common interface for different error handler implementations
 *
 * @abstract
 * @class ErrorHandlerProvider
 */
export abstract class ErrorHandlerProvider {

  /**
   * Handles an error that occurred during request processing
   * 
   * @param error - The Error object containing error details
   * @returns Promise<Response> | Response - The response to be sent to the client
   */
  public abstract handleError(error: Error): Promise<Response> | Response;

}
