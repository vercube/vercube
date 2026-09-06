import { ROOT_CONTEXT } from '@opentelemetry/api';
import type { Context, ContextManager } from '@opentelemetry/api';
import type { RequestContext } from '@vercube/core';

/**
 * OpenTelemetry context manager backed by Vercube's request context.
 *
 * OpenTelemetry ships `AsyncLocalStorageContextManager`, which allocates its
 * own `AsyncLocalStorage`. Vercube already opens one frame per request for
 * {@link RequestContext}, and a second async-context frame costs a measurable
 * slice of throughput on a framework whose fast path is otherwise
 * allocation-free. This manager stores the OpenTelemetry context inside the
 * frame that already exists.
 *
 * Nested frames share the request's root frame, so values written with
 * `RequestContext.set()` from inside a span are still visible after it ends.
 */
export class VercubeContextManager implements ContextManager {
  /** The request context this manager stores OpenTelemetry contexts in. */
  private readonly fRequestContext: RequestContext;

  /** Whether the manager is currently active. */
  private fEnabled = false;

  /**
   * @param requestContext - The application's request context service
   */
  constructor(requestContext: RequestContext) {
    this.fRequestContext = requestContext;
  }

  /**
   * The context active in the current async frame.
   *
   * @returns The active context, or the root context outside any frame
   */
  public active(): Context {
    if (!this.fEnabled) {
      return ROOT_CONTEXT;
    }

    return (this.fRequestContext.getOtelContext() as Context | undefined) ?? ROOT_CONTEXT;
  }

  /**
   * Runs `fn` with `context` active.
   *
   * The result is passed through unchanged, so a synchronous callback stays
   * synchronous - the request fast path depends on it.
   *
   * @param context - The context to activate
   * @param fn - The function to run
   * @param thisArg - `this` for the call
   * @param args - Arguments for the call
   * @returns Whatever `fn` returned
   */
  public with<A extends unknown[], F extends (...args: A) => ReturnType<F>>(
    context: Context,
    fn: F,
    thisArg?: ThisParameterType<F>,
    ...args: A
  ): ReturnType<F> {
    if (!this.fEnabled) {
      return fn.call(thisArg as ThisParameterType<F>, ...args);
    }

    return this.fRequestContext.runWithOtelContext(context, () => fn.call(thisArg as ThisParameterType<F>, ...args));
  }

  /**
   * Binds a target to a context.
   *
   * Only functions are bound. OpenTelemetry's own manager additionally rebinds
   * every listener of an `EventEmitter`; nothing in Vercube relies on that, and
   * doing it would mean reaching into Node's emitter internals.
   *
   * @param context - The context to bind to
   * @param target - The value to bind
   * @returns The bound value, or the value unchanged when it is not a function
   */
  public bind<T>(context: Context, target: T): T {
    if (typeof target !== 'function') {
      return target;
    }

    const fn = target as unknown as (...args: unknown[]) => unknown;
    // Arrow, so it closes over the manager while `bound` keeps the caller's `this`.
    const activate = <R>(run: () => R): R => this.with(context, run);

    return function bound(this: unknown, ...args: unknown[]): unknown {
      return activate(() => fn.apply(this, args));
    } as unknown as T;
  }

  /**
   * Activates the manager.
   *
   * @returns This manager
   */
  public enable(): this {
    this.fEnabled = true;
    return this;
  }

  /**
   * Deactivates the manager. Everything falls back to the root context.
   *
   * @returns This manager
   */
  public disable(): this {
    this.fEnabled = false;
    return this;
  }
}
