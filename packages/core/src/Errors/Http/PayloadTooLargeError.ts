import { HttpError } from '../HttpError';

/**
 * Represents a Payload Too Large error (HTTP 413).
 * @extends {HttpError}
 */
export class PayloadTooLargeError extends HttpError {
  /**
   * The name of the error.
   * @type {string}
   */
  public override name: string = 'PayloadTooLargeError';

  /**
   * Creates an instance of PayloadTooLargeError.
   * @param {string} [message] - The error message.
   */
  constructor(message?: string) {
    super(413);
    Object.setPrototypeOf(this, PayloadTooLargeError.prototype);

    if (message) {
      this.message = message;
    }
  }
}
