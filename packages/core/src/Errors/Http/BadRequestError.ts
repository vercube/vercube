import { HttpError } from '../HttpError';
import type { StandardSchemaV1 } from '@standard-schema/spec';

/**
 * Represents a Bad Request error (HTTP 400).
 * @extends {HttpError}
 */
export class BadRequestError<E = readonly StandardSchemaV1.Issue[]> extends HttpError {
  /**
   * The HTTP status code every instance answers with, readable without
   * creating one (`@Throws` and the client typegen read it).
   */
  public static readonly status: number = 400;

  /**
   * The name of the error.
   * @type {string}
   */
  public override name: string = 'BadRequestError';

  /**
   * Details of what was wrong. `ValidationMiddleware` sets the validation
   * issues; absent for a body that is not valid JSON or form data.
   */
  declare public errors?: E;

  /**
   * Creates an instance of BadRequestError.
   * @param {string} [message] - The error message.
   * @param {E} [errors] - Details, validation issues by default.
   */
  constructor(message?: string, errors?: E) {
    super(400);
    Object.setPrototypeOf(this, BadRequestError.prototype);

    if (message) {
      this.message = message;
    }

    if (errors) {
      this.errors = errors;
    }
  }
}
