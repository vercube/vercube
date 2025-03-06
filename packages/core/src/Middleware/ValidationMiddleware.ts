
import { InjectOptional } from '@vercube/di';
import { BaseMiddleware } from '../Services/Middleware/BaseMiddleware';
import { HttpEvent, MiddlewareOptions } from '../Types/CommonTypes';
import { BadRequestError } from '../Errors/Http/BadRequestError';
import { ValidationProvider } from '../Services/Validation/ValidationProvider';

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
   * @param {MiddlewareOptions} args - Additional arguments for the middleware
   * @returns {Promise<void>} - A promise that resolves when the processing is complete
   * @throws {BadRequestError} - If validation fails
   */
  public async onRequest(event: HttpEvent, args: MiddlewareOptions): Promise<void> {
    if (!this.gValidationProvider) {
      console.warn('ValidationMiddleware::ValidationProvider is not registered');
      return;
    }

    // get all data to validate
    const validators = args.methodArgs?.filter((arg) => arg.validate && arg.validationSchema) ?? [];

    // validate data
    for (const validator of validators) {
      const result = await this.gValidationProvider.validate(validator.validationSchema!, validator.resolved);

      if (result.issues?.length) {
        throw new BadRequestError(`Validation error - ${validator.type}`, result.issues);
      }
    }
  }

}
