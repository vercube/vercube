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
  abstract handleError(error: H3Error, event: HttpEvent): Promise<void> | void;
}
