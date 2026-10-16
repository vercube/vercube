import { HttpError } from '../HttpError';

/**
 * Represents a Unsupported Media Type error (HTTP 415).
 * @extends {HttpError}
 */
export class UnsupportedMediaTypeError extends HttpError {
  /**
   * The name of the error.
   * @type {string}
   */
  public override name: string = 'UnsupportedMediaTypeError';

  /**
   * Creates an instance of UnsupportedMediaTypeError.
   * @param {string} [message] - The error message.
   */
  constructor(message?: string) {
    super(415);
    Object.setPrototypeOf(this, UnsupportedMediaTypeError.prototype);

    if (message) {
      this.message = message;
    }
  }
}
