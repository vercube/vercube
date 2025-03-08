import { H3Error } from 'h3';
import { HttpEvent } from '@vercube/core';

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
   * @param error - The H3Error object containing error details
   * @param event - The HttpEvent object representing the current request
   * @returns Promise<void> | void - Returns either a Promise that resolves to void, or void directly
   */
  public abstract handleError(error: H3Error, event: HttpEvent): Promise<void> | void;

}
