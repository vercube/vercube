 
import { readBody } from 'h3';
import { InjectOptional } from '@vercube/di';
import { BaseMiddleware } from '../Services/Middleware/BaseMiddleware';
import { HttpEvent } from '../Types/CommonTypes';
import { BadRequestError } from '../Errors/Http/BadRequestError';
import { ValidationTypes } from '../Types/ValidationTypes';
import { ValidationProvider } from '../Services/Validation/ValidationProvider';

interface MiddlewareOptions {
  schema?: ValidationTypes.Schema;
}

/**
 * Middleware for validating request data against a schema
 * @class ValidationMiddleware
 * @implements {BaseMiddleware}
 * @description Validates incoming request data against a provided schema
 * @example
 * const middleware = new ValidationMiddleware();
 * await middleware.use(event, { schema: myValidationSchema });
 */
export class ValidationMiddleware implements BaseMiddleware {

  @InjectOptional(ValidationProvider)
  private gValidationProvider: ValidationProvider | null;

  /**
   * Middleware function that processes the HTTP event
   * @param {HttpEvent} event - The HTTP event to be processed
   * @param {T[]} args - Additional arguments for the middleware
   * @returns {Promise<void>} - A promise that resolves when the processing is complete
   * @throws {BadRequestError} - If validation fails
   */
  public async use(event: HttpEvent, args: unknown): Promise<void> {
    if (!this.gValidationProvider) {
      console.warn('ValidationMiddleware::ValidationProvider is not registered');
      return;
    }

    const body = await readBody(event);
    const schema = (args as MiddlewareOptions)?.schema;

    if (!schema) {
      return;
    }

    const result = await this.gValidationProvider.validate(schema, body);

    if (result.issues?.length) {
      throw new BadRequestError('Validation error', result.issues);
    }
  }

}