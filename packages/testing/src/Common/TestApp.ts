import { TestingError } from '../Errors/TestingError';
import { CookieJar } from '../Request/CookieJar';
import { TestClient } from './TestClient';
import type { TestLogger } from '../Services/TestLogger';
import type { TestingTypes } from '../Types/TestingTypes';
import type { App } from '@vercube/core';
import type { Container, IOC } from '@vercube/di';

/** Attaches the user given to `.as()` to a request. */
export type Impersonator = (request: Request, user: unknown) => Request | void;

/**
 * An application booted by {@link createTestApp}, with request builders that
 * go straight through `app.fetch()`: no port is opened.
 *
 * HTTP gets the short verbs (`get`, `post`...). The container is reached with
 * `resolve()` and `resolveOptional()`.
 *
 * @example
 * ```ts
 * await using app = await createTestApp({ controllers: [UserController] });
 *
 * const res = await app.get('/users/1').expect(200);
 * expect(await res.json()).toEqual({ id: '1' });
 * ```
 */
export class TestApp extends TestClient {
  /** The application itself, for anything this class does not cover. */
  public readonly app: App;

  /** @inheritdoc */
  public readonly baseUrl: string;

  /** The application sends no cookies by itself; agents keep them. */
  public readonly jar: CookieJar | null = null;

  /** The logger bound by `createTestApp`, null with `logger: false`. */
  private readonly fLogs: TestLogger | null;

  /** Extensions, in registration order. */
  private readonly fExtensions: TestingTypes.Extension[];

  /** Set by an extension, such as `testAuth()`, to support `.as()`. */
  private fImpersonator: Impersonator | null = null;

  /** The close in progress, so `close()` runs once. */
  private fClosing: Promise<void> | null = null;

  /**
   * @param app - The booted application
   * @param options - What `createTestApp` set up
   * @param options.logs - The bound test logger, if any
   * @param options.baseUrl - Base URL for relative paths
   * @param options.extensions - Extensions to tear down on close
   */
  constructor(app: App, options: { logs: TestLogger | null; baseUrl: string; extensions: TestingTypes.Extension[] }) {
    super();
    this.app = app;
    this.baseUrl = options.baseUrl;
    this.fLogs = options.logs;
    this.fExtensions = options.extensions;
  }

  /** The application's container. */
  public get container(): Container {
    return this.app.container;
  }

  /**
   * What the application logged.
   *
   * @throws {TestingError} When the app was created with `logger: false`
   */
  public get logs(): TestLogger {
    if (!this.fLogs) {
      throw new TestingError('app.logs is not available: the app was created with `logger: false`.');
    }

    return this.fLogs;
  }

  /**
   * Gets a service from the container.
   *
   * @param key - The service key
   * @returns The service
   */
  public resolve<T>(key: IOC.ServiceKey<T>): T {
    return this.app.container.get(key);
  }

  /**
   * Gets a service from the container, or null when nothing is bound.
   *
   * @param key - The service key
   * @returns The service, or null
   */
  public resolveOptional<T>(key: IOC.ServiceKey<T>): T | null {
    return this.app.container.getOptional(key);
  }

  /**
   * Sends a request through the application as is.
   *
   * @param input - A `Request`, or a path or URL
   * @param init - Request options, when `input` is not a `Request`
   * @returns The response
   */
  public fetch(input: Request | string, init?: RequestInit): Promise<Response> {
    return this.dispatch(typeof input === 'string' ? new Request(new URL(input, this.baseUrl), init) : input);
  }

  /** @inheritdoc */
  public dispatch(request: Request): Promise<Response> {
    if (this.fClosing) {
      return Promise.reject(new TestingError(`${request.method} ${request.url} was sent after app.close().`));
    }

    return this.app.fetch(request);
  }

  /**
   * A client that keeps the cookies responses set and sends them back, the way
   * a browser would. Agents do not share cookies.
   *
   * @returns The agent
   *
   * @example
   * ```ts
   * const agent = app.agent();
   * await agent.post('/login').json({ user: 'ada' }).expect(204);
   * await agent.get('/me').expect(200);
   * ```
   */
  public agent(): TestAgent {
    return new TestAgent(this);
  }

  /**
   * Lets an extension support `.as(user)`. The handler gets the `Request` the
   * builder made, and either marks it or returns a replacement.
   *
   * @param handler - Attaches the user to the request
   */
  public useImpersonator(handler: Impersonator): void {
    this.fImpersonator = handler;
  }

  /** @inheritdoc */
  public impersonate(request: Request, user: unknown): Request {
    if (!this.fImpersonator) {
      throw new TestingError(
        '.as(user) needs an extension that authenticates users, such as testAuth() from @vercube/testing/auth.',
      );
    }

    return this.fImpersonator(request, user) ?? request;
  }

  /**
   * Not supported: once the application has booted, a replaced binding no
   * longer reaches the services that already hold the old one.
   *
   * @throws {TestingError} Always
   */
  public override(): never {
    throw new TestingError(
      'Dependencies cannot be replaced once the app has booted: services already hold the original. Pass them in the `overrides` option of createTestApp() instead.',
    );
  }

  /**
   * Closes the application, which runs its `onClose()` callbacks and
   * `@Destroy()` hooks, then tears the extensions down, last first.
   *
   * Safe to call more than once.
   *
   * @returns Resolves once everything is closed
   */
  public close(): Promise<void> {
    this.fClosing ??= this.shutdown();
    return this.fClosing;
  }

  /**
   * Closes the application at the end of an `await using` block.
   *
   * @returns Resolves once everything is closed
   */
  public [Symbol.asyncDispose](): Promise<void> {
    return this.close();
  }

  /**
   * Closes the application, then the extensions, collecting every failure.
   *
   * @returns Resolves once everything is closed
   * @throws {AggregateError} When something failed to close
   */
  private async shutdown(): Promise<void> {
    const errors: unknown[] = [];

    try {
      await this.app.close({ timeout: 0 });
    } catch (error) {
      errors.push(...(error instanceof AggregateError ? error.errors : [error]));
    }

    for (const extension of [...this.fExtensions].reverse()) {
      try {
        await extension.teardown?.();
      } catch (error) {
        errors.push(error);
      }
    }

    if (errors.length > 0) {
      throw new AggregateError(errors, 'Failed to close the test app');
    }
  }
}

/**
 * A client of a {@link TestApp} with its own cookie jar.
 */
export class TestAgent extends TestClient {
  /** @inheritdoc */
  public readonly jar: CookieJar = new CookieJar();

  /** The application requests go to. */
  private readonly fApp: TestApp;

  /**
   * @param app - The application requests go to
   */
  constructor(app: TestApp) {
    super();
    this.fApp = app;
  }

  /** @inheritdoc */
  public get baseUrl(): string {
    return this.fApp.baseUrl;
  }

  /** @inheritdoc */
  public dispatch(request: Request): Promise<Response> {
    return this.fApp.dispatch(request);
  }

  /** @inheritdoc */
  public impersonate(request: Request, user: unknown): Request {
    return this.fApp.impersonate(request, user);
  }
}
