import { TestingError } from '../Errors/TestingError';
import { formatFailure } from '../Utils/Format';
import { TestResponse } from './TestResponse';
import type { TestingTypes } from '../Types/TestingTypes';
import type { CookieJar } from './CookieJar';

/**
 * Where a {@link TestRequest} is sent. Implemented by `TestApp` and its agents.
 */
export interface RequestTarget {
  /** Base URL relative paths resolve against. */
  readonly baseUrl: string;

  /** Cookies sent with the request and updated from the response, for an agent. */
  readonly jar: CookieJar | null;

  /** Sends the request through the application. */
  dispatch(request: Request): Promise<Response>;

  /** Attaches the user given to `.as()`, set up by an extension such as `testAuth()`. */
  impersonate(request: Request, user: unknown): Request;
}

/** One `.expect()`, run against the response in the order they were added. */
type Expectation =
  | { kind: 'status'; status: number }
  | { kind: 'header'; name: string; value: string | RegExp }
  | { kind: 'check'; check: (res: TestResponse) => void | Promise<void> };

/** A body and what a failure message shows of it. */
interface PreparedBody {
  body: BodyInit;
  preview: string;
  contentType?: string;
}

/**
 * Builds a request, sends it through the application and checks the response.
 *
 * Nothing is sent until the request is awaited (or `send()` is called), so
 * the builder methods can be chained in any order. Awaiting it twice sends it
 * once.
 *
 * Expectations cover the status and the headers. Check the body with the
 * test runner's own assertions, which diff far better than a message could.
 *
 * @example
 * ```ts
 * const res = await app
 *   .post('/users')
 *   .bearer(token)
 *   .json({ name: 'Ada' })
 *   .expect(201)
 *   .expect('content-type', /json/);
 *
 * expect(await res.json()).toMatchObject({ name: 'Ada' });
 * ```
 */
export class TestRequest implements PromiseLike<TestResponse> {
  /** Where the request goes. */
  private readonly fTarget: RequestTarget;

  /** HTTP method. */
  private readonly fMethod: string;

  /** URL, query included. */
  private readonly fUrl: URL;

  /** Request headers. */
  private readonly fHeaders: Headers = new Headers();

  /** Cookies set with `.cookie()`. */
  private readonly fCookies: Map<string, string> = new Map();

  /** The body, once one was set. */
  private fBody: PreparedBody | null = null;

  /** Abort signal. */
  private fSignal: AbortSignal | undefined;

  /** The user given to `.as()`, wrapped so `undefined` can be told from unset. */
  private fUser: { value: unknown } | null = null;

  /** Expectations, in order. */
  private readonly fExpectations: Expectation[] = [];

  /** The exchange in flight, so awaiting twice sends once. */
  private fSent: Promise<TestResponse> | null = null;

  /**
   * @param target - Where the request goes
   * @param method - HTTP method
   * @param path - A path relative to the base URL, or an absolute URL
   */
  constructor(target: RequestTarget, method: string, path: string) {
    this.fTarget = target;
    this.fMethod = method.toUpperCase();
    this.fUrl = new URL(path, target.baseUrl);
  }

  /**
   * Sets a header, replacing an earlier value.
   *
   * @param name - Header name
   * @param value - Header value
   * @returns The request, for chaining
   */
  public header(name: string, value: string): this {
    this.fHeaders.set(name, value);
    return this;
  }

  /**
   * Sets several headers.
   *
   * @param values - Headers by name
   * @returns The request, for chaining
   */
  public headers(values: Record<string, string>): this {
    for (const [name, value] of Object.entries(values)) {
      this.fHeaders.set(name, value);
    }

    return this;
  }

  /**
   * Adds query parameters. Arrays repeat the key, `null` and `undefined` are
   * skipped.
   *
   * @param values - Parameters by name
   * @returns The request, for chaining
   *
   * @example
   * ```ts
   * app.get('/search').query({ q: 'ada', tag: ['a', 'b'], page: 2 }); // ?q=ada&tag=a&tag=b&page=2
   * ```
   */
  public query(values: TestingTypes.Query): this {
    for (const [name, value] of Object.entries(values)) {
      if (value === null || value === undefined) {
        continue;
      }

      for (const item of Array.isArray(value) ? value : [value]) {
        this.fUrl.searchParams.append(name, String(item));
      }
    }

    return this;
  }

  /**
   * Sends a cookie.
   *
   * @param name - Cookie name
   * @param value - Cookie value
   * @returns The request, for chaining
   */
  public cookie(name: string, value: string): this {
    this.fCookies.set(name, value);
    return this;
  }

  /**
   * Sends a JSON body, with `content-type: application/json` unless one was set.
   *
   * @param body - Any JSON-serialisable value
   * @returns The request, for chaining
   */
  public json(body: unknown): this {
    const text = JSON.stringify(body);
    this.fBody = { body: text, preview: text, contentType: 'application/json' };
    return this;
  }

  /**
   * Sends a text body.
   *
   * @param body - The text
   * @param contentType - Content type, defaults to `text/plain`
   * @returns The request, for chaining
   */
  public text(body: string, contentType: string = 'text/plain'): this {
    this.fBody = { body, preview: body, contentType };
    return this;
  }

  /**
   * Sends a `multipart/form-data` body. The boundary is chosen by `Request`.
   *
   * @param body - Form data, or fields by name where a `Blob` becomes a file
   * @returns The request, for chaining
   */
  public form(body: FormData | Record<string, string | Blob>): this {
    let data: FormData;

    if (body instanceof FormData) {
      data = body;
    } else {
      data = new FormData();

      for (const [name, value] of Object.entries(body)) {
        data.append(name, value);
      }
    }

    const preview = [...data.entries()]
      .map(([name, value]) => {
        if (typeof value === 'string') {
          return `${name}=${value}`;
        }

        const file = value as Blob & { name?: string };
        return `${name}=<file ${file.name || 'blob'}, ${file.size} bytes>`;
      })
      .join('\n');

    this.fBody = { body: data, preview: `(multipart)\n${preview}` };
    return this;
  }

  /**
   * Sends an `application/x-www-form-urlencoded` body.
   *
   * @param body - Fields by name
   * @returns The request, for chaining
   */
  public urlencoded(body: Record<string, string>): this {
    const params = new URLSearchParams(body);
    this.fBody = { body: params, preview: params.toString() };
    return this;
  }

  /**
   * Sends a body as is. Set its content type with `.header()`.
   *
   * @param body - Anything `Request` accepts
   * @returns The request, for chaining
   */
  public body(body: BodyInit): this {
    this.fBody = { body, preview: typeof body === 'string' ? body : '(raw body)' };
    return this;
  }

  /**
   * Sets `Authorization: Bearer <token>`.
   *
   * @param token - The token
   * @returns The request, for chaining
   */
  public bearer(token: string): this {
    return this.header('authorization', `Bearer ${token}`);
  }

  /**
   * Sends the request as this user. Needs an extension that knows how to
   * authenticate one, such as `testAuth()` from `@vercube/testing/auth`.
   *
   * @param user - The user, as the auth provider returns it
   * @returns The request, for chaining
   */
  public as(user: unknown): this {
    this.fUser = { value: user };
    return this;
  }

  /**
   * Aborts the request with this signal.
   *
   * @param signal - The signal
   * @returns The request, for chaining
   */
  public signal(signal: AbortSignal): this {
    this.fSignal = signal;
    return this;
  }

  /**
   * Expects a status code.
   *
   * @param status - The status
   * @returns The request, for chaining
   */
  public expect(status: number): this;

  /**
   * Expects a header, equal to a string or matching a RegExp.
   *
   * @param header - Header name
   * @param value - Expected value
   * @returns The request, for chaining
   */
  public expect(header: string, value: string | RegExp): this;

  /**
   * Runs a check against the response. Throw, or use the runner's `expect`,
   * to fail it.
   *
   * @param check - The check
   * @returns The request, for chaining
   */
  public expect(check: (res: TestResponse) => void | Promise<void>): this;

  public expect(first: number | string | ((res: TestResponse) => void | Promise<void>), value?: string | RegExp): this {
    if (typeof first === 'number') {
      this.fExpectations.push({ kind: 'status', status: first });
    } else if (typeof first === 'string') {
      if (value === undefined) {
        throw new TestingError(`expect("${first}") needs the expected value as its second argument.`);
      }

      this.fExpectations.push({ kind: 'header', name: first, value });
    } else {
      this.fExpectations.push({ kind: 'check', check: first });
    }

    return this;
  }

  /**
   * Sends the request and runs the expectations.
   *
   * @returns The response
   * @throws {TestingError} When an expectation fails, with the exchange in the message
   */
  public send(): Promise<TestResponse> {
    this.fSent ??= this.exchange();
    return this.fSent;
  }

  /**
   * Sends the request when awaited.
   *
   * @param onfulfilled - Called with the response
   * @param onrejected - Called with the failure
   * @returns A promise of what the callbacks return
   */
  // thenable on purpose: `await app.get('/')` is how a request is sent
  // oxlint-disable-next-line unicorn/no-thenable
  public then<A = TestResponse, B = never>(
    onfulfilled?: ((value: TestResponse) => A | PromiseLike<A>) | null,
    onrejected?: ((reason: unknown) => B | PromiseLike<B>) | null,
  ): Promise<A | B> {
    return this.send().then(onfulfilled, onrejected);
  }

  /**
   * Sends the request and handles a failure.
   *
   * @param onrejected - Called with the failure
   * @returns A promise of the response, or of what the callback returns
   */
  public catch<B = never>(onrejected?: ((reason: unknown) => B | PromiseLike<B>) | null): Promise<TestResponse | B> {
    return this.send().catch(onrejected);
  }

  /**
   * Sends the request and runs a callback once it settles.
   *
   * @param onfinally - Called either way
   * @returns A promise of the response
   */
  public finally(onfinally?: (() => void) | null): Promise<TestResponse> {
    return this.send().finally(onfinally);
  }

  /**
   * Builds the `Request`, sends it and checks the response.
   *
   * @returns The response
   */
  private async exchange(): Promise<TestResponse> {
    const headers = new Headers(this.fHeaders);

    if (this.fBody?.contentType && !headers.has('content-type')) {
      headers.set('content-type', this.fBody.contentType);
    }

    const cookies = [this.fTarget.jar?.header(), [...this.fCookies].map(([name, value]) => `${name}=${value}`).join('; ')]
      .filter(Boolean)
      .join('; ');

    if (cookies) {
      headers.set('cookie', headers.has('cookie') ? `${headers.get('cookie')}; ${cookies}` : cookies);
    }

    let request = new Request(this.fUrl, {
      method: this.fMethod,
      headers,
      body: this.fBody?.body,
      signal: this.fSignal,
    });

    if (this.fUser) {
      request = this.fTarget.impersonate(request, this.fUser.value);
    }

    const snapshot: TestingTypes.RequestSnapshot = {
      method: this.fMethod,
      url: this.fUrl.toString(),
      headers: request.headers,
      body: this.fBody?.preview,
    };

    const raw = await this.fTarget.dispatch(request);

    this.fTarget.jar?.store(raw);

    const response = new TestResponse(raw, snapshot);

    for (const expectation of this.fExpectations) {
      await this.check(expectation, response);
    }

    return response;
  }

  /**
   * Runs one expectation.
   *
   * @param expectation - The expectation
   * @param response - The response
   * @returns Resolves when it holds
   * @throws {TestingError} When it does not, or the error a check threw with the exchange appended
   */
  private async check(expectation: Expectation, response: TestResponse): Promise<void> {
    if (expectation.kind === 'check') {
      try {
        await expectation.check(response);
      } catch (error) {
        // The runner's own assertion error keeps its diff, it only gains the exchange.
        if (error instanceof Error) {
          error.message = formatFailure(error.message, response.request, await response.snapshot());
          throw error;
        }

        throw new TestingError(formatFailure(String(error), response.request, await response.snapshot()), { cause: error });
      }

      return;
    }

    let headline: string | null = null;

    if (expectation.kind === 'status' && response.status !== expectation.status) {
      headline = `Expected status ${expectation.status}, got ${response.status}`;
    }

    if (expectation.kind === 'header') {
      const actual = response.headers.get(expectation.name);
      const expected = typeof expectation.value === 'string' ? `"${expectation.value}"` : String(expectation.value);
      const holds =
        actual !== null &&
        (typeof expectation.value === 'string' ? actual === expectation.value : expectation.value.test(actual));

      if (!holds) {
        headline = `Expected header ${expectation.name} to ${typeof expectation.value === 'string' ? 'be' : 'match'} ${expected}, got ${actual === null ? 'no such header' : `"${actual}"`}`;
      }
    }

    if (headline) {
      const snapshot = await response.snapshot();

      throw new TestingError(formatFailure(headline, response.request, snapshot), {
        request: response.request,
        response: snapshot,
      });
    }
  }
}
