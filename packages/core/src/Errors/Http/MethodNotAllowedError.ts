import { HttpError } from '../HttpError';

/**
 * Represents a Method Not Allowed error (HTTP 405).
 * @extends {HttpError}
 */
export class MethodNotAllowedError extends HttpError {

  /**
   * The name of the error.
   * @type {string}
   */
  public override name: string = 'MethodNotAllowedError';

  /**
   * Creates an instance of MethodNotAllowedError.
   * @param {string} [message] - The error message.
   */
  constructor(message?: string) {
    super(405);
    Object.setPrototypeOf(this, MethodNotAllowedError.prototype);

    if (message) {
      this.message = message;
    }

  }

}