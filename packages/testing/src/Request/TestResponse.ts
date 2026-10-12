import { TestingError } from '../Errors/TestingError';
import { truncate } from '../Utils/Format';
import { getSetCookies, parseSetCookie } from './CookieJar';
import { readSse } from './Sse';
import type { TestingTypes } from '../Types/TestingTypes';

/** Content types a failure message prints as text. */
const TEXT_TYPE = /^text\/|json|xml|javascript|x-www-form-urlencoded/i;

/**
 * A response from the application under test.
 *
 * The body is read once and kept, so `json()`, `text()` and `bytes()` can be
 * called any number of times, in any order. `events()` is the exception: it
 * reads a server-sent event stream as it arrives and keeps nothing.
 */
export class TestResponse {
  /** The response as the application returned it. */
  public readonly raw: Response;

  /** The request it answers, for failure messages. */
  public readonly request: TestingTypes.RequestSnapshot;

  /** The body, once read. */
  private fBody: Promise<Uint8Array> | null = null;

  /** Whether `events()` took the stream. */
  private fStreamed: boolean = false;

  /**
   * @param raw - The response
   * @param request - What a failure message shows of the request
   */
  constructor(raw: Response, request: TestingTypes.RequestSnapshot) {
    this.raw = raw;
    this.request = request;
  }

  /** The status code. */
  public get status(): number {
    return this.raw.status;
  }

  /** The response headers. */
  public get headers(): Headers {
    return this.raw.headers;
  }

  /** Whether the status is in the 2xx range. */
  public get ok(): boolean {
    return this.raw.ok;
  }

  /**
   * The body as bytes.
   *
   * @returns The body
   * @throws {TestingError} When `events()` already took the stream
   */
  public bytes(): Promise<Uint8Array> {
    if (this.fStreamed) {
      throw new TestingError('The body was read as an event stream by events(), it cannot be read again.');
    }

    this.fBody ??= this.raw.arrayBuffer().then((buffer) => new Uint8Array(buffer));

    return this.fBody;
  }

  /**
   * The body as text.
   *
   * @returns The body
   */
  public async text(): Promise<string> {
    return new TextDecoder().decode(await this.bytes());
  }

  /**
   * The body parsed as JSON.
   *
   * @template T - The expected shape, not checked
   * @returns The parsed body
   * @throws {TestingError} When the body is not JSON, with the start of it
   */
  public async json<T = unknown>(): Promise<T> {
    const text = await this.text();

    try {
      return JSON.parse(text) as T;
    } catch (error) {
      throw new TestingError(
        `Expected a JSON body from ${this.request.method} ${this.request.url}, got ${this.headers.get('content-type') ?? 'no content type'}:\n${truncate(text) || '(empty body)'}`,
        { cause: error, request: this.request, response: { status: this.status, headers: this.headers, body: text } },
      );
    }
  }

  /**
   * The cookies the response sets, by name. Cookies it deletes are left out.
   *
   * @returns The cookies
   */
  public cookies(): Record<string, string> {
    const cookies: Record<string, string> = {};

    for (const header of getSetCookies(this.headers)) {
      const cookie = parseSetCookie(header);

      if (cookie && !cookie.expired) {
        cookies[cookie.name] = cookie.value;
      }
    }

    return cookies;
  }

  /**
   * Reads a `text/event-stream` body event by event, as the application sends
   * them. Breaking out of the loop cancels the stream, which aborts the
   * handler the way a client disconnecting would.
   *
   * @returns The events
   * @throws {TestingError} When the body was already read, or there is none
   *
   * @example
   * ```ts
   * const res = await app.get('/events').expect(200);
   *
   * for await (const event of res.events()) {
   *   expect(event.data).toBe('ready');
   *   break;
   * }
   * ```
   */
  public events(): AsyncIterable<TestingTypes.SseEvent> {
    if (this.fBody) {
      throw new TestingError('The body was already read by json(), text() or bytes(), events() needs the unread stream.');
    }

    if (this.fStreamed) {
      throw new TestingError('events() can only be called once per response.');
    }

    if (!this.raw.body) {
      throw new TestingError(`${this.request.method} ${this.request.url} returned no body to read events from.`);
    }

    this.fStreamed = true;

    return readSse(this.raw.body);
  }

  /**
   * What a failure message shows of this response. An event stream is not
   * read, since it may never end.
   *
   * @returns The snapshot
   */
  public async snapshot(): Promise<TestingTypes.ResponseSnapshot> {
    const contentType = this.headers.get('content-type') ?? '';

    if (this.fStreamed || contentType.includes('text/event-stream')) {
      return { status: this.status, headers: this.headers, body: '(event stream, not read)' };
    }

    const bytes = await this.bytes().catch(() => null);

    if (!bytes) {
      return { status: this.status, headers: this.headers, body: '(unreadable body)' };
    }

    if (contentType && bytes.byteLength > 0 && !TEXT_TYPE.test(contentType)) {
      return { status: this.status, headers: this.headers, body: `(${bytes.byteLength} bytes of ${contentType})` };
    }

    return { status: this.status, headers: this.headers, body: new TextDecoder().decode(bytes) };
  }
}
