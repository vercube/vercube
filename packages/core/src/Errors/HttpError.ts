/**
 * Represents an HTTP error.
 * @extends {Error}
 */
export class HttpError extends Error {
  /**
   * The HTTP status code associated with the error.
   * @type {number}
   */
  public status!: number;

  /**
   * Creates an instance of HttpError.
   * @param {number} status - The HTTP status code.
   * @param {string} [message] - The error message.
   */
  constructor(status: number, message?: string) {
    super();
    Object.setPrototypeOf(this, HttpError.prototype);

    if (status) {
      this.status = status;
    }

    if (message) {
      this.message = message;
    }

    // eslint-disable-next-line unicorn/error-message
    this.stack = new Error().stack;
  }
}
