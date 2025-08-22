import { HttpError } from '../HttpError';

/**
 * Represents a Bad Request error (HTTP 400).
 * @extends {HttpError}
 */
export class BadRequestError extends HttpError {
  /**
   * The name of the error.
   * @type {string}
   */
  public override name: string = 'BadRequestError';

  /**
   * Creates an instance of BadRequestError.
   * @param {string} [message] - The error message.
   */
  constructor(message?: string, errors?: any) {
    super(400);
    Object.setPrototypeOf(this, BadRequestError.prototype);

    if (message) {
      this.message = message;
    }

    if (errors) {
      (this as any).errors = errors;
    }
  }
}
