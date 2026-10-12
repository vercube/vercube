import type { TestApp } from '../Common/TestApp';
import type { App, BasePlugin, ConfigTypes, MaybePromise } from '@vercube/core';
import type { IOC } from '@vercube/di';

export namespace TestingTypes {
  /**
   * Replaces a dependency: `[key, replacement]`.
   *
   * The replacement is either an object, bound as the instance itself (a
   * partial is fine, see `strictOverrides`), or a class, bound as a singleton
   * and constructed with its own `@Inject()`s.
   *
   * @example
   * ```ts
   * const overrides: TestingTypes.Override[] = [
   *   [UserRepository, { findById: async (id) => ({ id, name: 'Ada' }) }],
   *   [Mailer, FakeMailer],
   * ];
   * ```
   */
  export type Override<T = any> = [IOC.ServiceKey<T>, Partial<T> | IOC.Newable<T>];

  /**
   * A service to bind: a class bound under itself, or `[key, implementation]`.
   */
  export type Provider = IOC.Newable<unknown> | [IOC.ServiceKey, IOC.Newable<unknown>];

  /**
   * A plugin to register, with or without options.
   */
  export type Plugin = typeof BasePlugin<any> | [typeof BasePlugin<any>, unknown?];

  /**
   * The phase {@link createTestApp} was in when it failed.
   */
  export type BootPhase = 'config' | 'setup' | 'plugins' | 'overrides' | 'initialize' | 'ready';

  /**
   * Options for {@link createTestApp}.
   */
  export interface TestAppOptions {
    /** Controller classes to bind. */
    controllers?: IOC.Newable<unknown>[];

    /** Services to bind as singletons. */
    providers?: Provider[];

    /**
     * Dependencies to replace. Applied once every plugin has been applied, so
     * they win over anything a plugin binds.
     */
    overrides?: Override[];

    /**
     * Wraps object overrides with {@link stub}, so calling a method the object
     * does not define throws instead of failing with `undefined is not a
     * function` somewhere further down. Defaults to `false`.
     */
    strictOverrides?: boolean;

    /** Plugins to register, as `app.addPlugin()` would. */
    plugins?: Plugin[];

    /**
     * Configuration merged over the defaults. Tests default to
     * `{ requestLogging: false, logLevel: 'error' }`.
     */
    config?: ConfigTypes.Config;

    /**
     * Where the configuration comes from. Defaults to `false`: neither
     * `vercube.config` nor `.env` is read. Pass `{ cwd }` to load a project's
     * own configuration, for an end-to-end smoke test for instance.
     */
    configFile?: false | { cwd?: string };

    /**
     * Binds a {@link TestLogger} and exposes it as `app.logs`. Defaults to
     * `true`. `false` keeps whatever logger the configuration binds.
     */
    logger?: boolean;

    /**
     * Free-form wiring, run after controllers, providers and plugins are bound
     * and before plugins are applied.
     */
    setup?: (app: App) => MaybePromise<void>;

    /** Base URL relative request paths resolve against. Defaults to `http://localhost`. */
    baseUrl?: string;

    /** Extensions from other packages, such as `testAuth()`. */
    extensions?: Extension[];
  }

  /**
   * Options for {@link createTestContainer}.
   */
  export interface TestContainerOptions {
    /** Services to bind as singletons. */
    providers?: Provider[];

    /** Dependencies to replace. */
    overrides?: Override[];

    /** Wraps object overrides with {@link stub}. Defaults to `false`. */
    strictOverrides?: boolean;

    /** Binds a {@link TestLogger}. Defaults to `true`. */
    logger?: boolean;
  }

  /**
   * Plugs another module into {@link createTestApp}. Modules ship theirs from
   * their own `/testing` entry, so this package never depends on them.
   *
   * @example
   * ```ts
   * export function withFakeMailer(): TestingTypes.Extension & { sent: Mail[] } {
   *   const sent: Mail[] = [];
   *
   *   return {
   *     name: 'fake-mailer',
   *     sent,
   *     beforeInitialize: (app) => app.container.bindMock(Mailer, { send: async (mail) => void sent.push(mail) }),
   *   };
   * }
   * ```
   */
  export interface Extension {
    /** Name shown when the extension fails. */
    name: string;

    /** Runs in `setup`, after the options' own bindings and before the user's `setup`. */
    setup?(app: App): MaybePromise<void>;

    /** Runs once plugins have been applied, after the options' `overrides`. */
    beforeInitialize?(app: App): MaybePromise<void>;

    /** Runs once the application has booted. */
    ready?(testApp: TestApp): MaybePromise<void>;

    /** Runs on `close()`, after the application has closed, last extension first. */
    teardown?(): MaybePromise<void>;
  }

  /** Severity of a {@link LogRecord}. `wide-event` marks what `emit()` recorded. */
  export type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'wide-event';

  /**
   * One call to the {@link TestLogger}.
   */
  export interface LogRecord {
    /** Severity, or `wide-event` for `emit()`. */
    level: LogLevel;

    /** The arguments as passed. */
    args: unknown[];

    /** The arguments rendered as one line, which string and RegExp matches run against. */
    message: string;

    /** The logger's context when the record was made. */
    context: Record<string, unknown>;

    /** `Date.now()` when the record was made. */
    at: number;
  }

  /** Matches a {@link LogRecord}: a substring of its message, a RegExp, or a predicate. */
  export type LogMatch = string | RegExp | ((record: LogRecord) => boolean);

  /**
   * One server-sent event.
   */
  export interface SseEvent {
    /** The `event:` field, when the server sent one. */
    event?: string;

    /** The `data:` lines, joined with `\n`. */
    data: string;

    /** The `id:` field, when the server sent one. */
    id?: string;

    /** The `retry:` field, when the server sent one. */
    retry?: number;
  }

  /**
   * Query values. Arrays repeat the key.
   */
  export type Query = Record<string, string | number | boolean | Array<string | number> | null | undefined>;

  /**
   * What a failure message shows of a request.
   */
  export interface RequestSnapshot {
    method: string;
    url: string;
    headers: Headers;
    body?: string;
  }

  /**
   * What a failure message shows of a response.
   */
  export interface ResponseSnapshot {
    status: number;
    headers: Headers;
    body?: string;
  }
}

/**
 * Plugs another module into {@link createTestApp}.
 * Alias of {@link TestingTypes.Extension}.
 */
export type TestExtension = TestingTypes.Extension;
