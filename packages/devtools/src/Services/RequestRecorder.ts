import { AsyncLocalStorage } from 'node:async_hooks';
import { GlobalMiddlewareRegistry, Router } from '@vercube/core';
import { Inject } from '@vercube/di';
import { REDACTED_HEADERS, TEXT_CONTENT_TYPES } from '../Constants/DevtoolsDefaults';
import { $DevtoolsOptions } from '../Symbols/DevtoolsSymbols';
import { isSecretKey } from '../Utils/Flatten';
import { isUnderMount } from '../Utils/Mount';
import { finalizeBootstrapProfile } from './BootstrapProfiler';
import { DevtoolsEventBus } from './DevtoolsEventBus';
import type { DevtoolsTypes } from '../Types/DevtoolsTypes';
import type { HttpServer, RouterTypes } from '@vercube/core';

/** Marks an already instrumented function. */
const INSTRUMENTED: unique symbol = Symbol('vercube.devtools.instrumented');

/**
 * Tags a wrapper function as instrumented.
 * @param fn wrapper function
 * @returns the same function, tagged
 */
function markInstrumented<T extends Function>(fn: T): T {
  (fn as unknown as Record<symbol, boolean>)[INSTRUMENTED] = true;
  return fn;
}

/**
 * @param value candidate function
 * @returns true when the value has already been wrapped by the recorder
 */
function isInstrumented(value: unknown): boolean {
  return typeof value === 'function' && (value as unknown as Record<symbol, boolean>)[INSTRUMENTED] === true;
}

/** Mutable trace collected while a request is in flight. */
interface ActiveTrace {
  record: DevtoolsTypes.RequestRecord;
  origin: number;
  /** Resolves with the request body preview, when body capture is on. */
  requestBody?: Promise<DevtoolsTypes.Payload>;
}

/**
 * Records HTTP requests with a middleware and handler timeline.
 * Instrumentation wraps resolved middleware and handler methods on the router.
 */
export class RequestRecorder {
  @Inject($DevtoolsOptions)
  private readonly gOptions!: DevtoolsTypes.ResolvedOptions;

  @Inject(DevtoolsEventBus)
  private readonly gEventBus!: DevtoolsEventBus;

  @Inject(Router)
  private readonly gRouter!: Router;

  @Inject(GlobalMiddlewareRegistry)
  private readonly gGlobalMiddlewares!: GlobalMiddlewareRegistry;

  /** Ring buffer of recorded requests, newest last. */
  private fRecords: DevtoolsTypes.RequestRecord[] = [];

  /** Carries the in-flight trace across the whole async request chain. */
  private fStorage: AsyncLocalStorage<ActiveTrace> = new AsyncLocalStorage<ActiveTrace>();

  /** Monotonically increasing id source for recorded requests. */
  private fNextId: number = 1;

  /** Number of routes covered by the last instrumentation pass. */
  private fInstrumentedRoutes: number = -1;

  /**
   * Recorded requests, newest first.
   *
   * @returns snapshot of the ring buffer
   */
  public get records(): DevtoolsTypes.RequestRecord[] {
    return [...this.fRecords].reverse();
  }

  /**
   * Id of the request currently in flight on this async context.
   * @returns the active request id, or `undefined` outside a request
   */
  public get activeRequestId(): string | undefined {
    return this.fStorage.getStore()?.record.id;
  }

  /**
   * Looks up a single recorded request.
   *
   * @param id request id
   * @returns the record, or `undefined` when it has been evicted
   */
  public find(id: string): DevtoolsTypes.RequestRecord | undefined {
    return this.fRecords.find((record) => record.id === id);
  }

  /**
   * Drops every recorded request.
   */
  public clear(): void {
    this.fRecords = [];
  }

  /**
   * Aggregate statistics over the current buffer.
   *
   * @returns request count, error count and latency percentiles
   */
  public stats(): DevtoolsTypes.Overview['requests'] {
    const durations = this.fRecords.map((record) => record.durationMs).sort((a, b) => a - b);
    const total = this.fRecords.length;

    if (total === 0) {
      return { total: 0, errors: 0, averageMs: 0, p95Ms: 0 };
    }

    const sum = durations.reduce((acc, value) => acc + value, 0);
    const p95Index = Math.min(durations.length - 1, Math.floor(durations.length * 0.95));

    return {
      total,
      errors: this.fRecords.filter((record) => record.status >= 400).length,
      averageMs: Math.round((sum / total) * 1000) / 1000,
      p95Ms: durations[p95Index],
    };
  }

  /**
   * Wraps the HTTP entry point so every request is traced end to end.
   * @param server the application HTTP server
   */
  public attach(server: HttpServer): void {
    if (isInstrumented(server.handleRequest)) {
      return;
    }

    const original = server.handleRequest.bind(server);

    const wrapped = async (request: Request): Promise<Response> => {
      // First request ends bootstrap profiling.
      finalizeBootstrapProfile();
      this.prepareRoutes();

      const url = new URL(request.url);

      if (!this.gOptions.trackRequests || isUnderMount(url.pathname, this.gOptions.path)) {
        return original(request);
      }

      const trace = this.createTrace(request, url);

      return this.fStorage.run(trace, async () => {
        try {
          const response = await original(request);

          const body = this.readResponseBody(response);
          this.complete(trace, response, body);

          return response;
        } catch (error) {
          this.fail(trace, error);
          throw error;
        }
      });
    };

    (server as unknown as { handleRequest: typeof wrapped }).handleRequest = markInstrumented(wrapped);
  }

  /**
   * Instruments routes and detaches global middlewares from devtools routes.
   * Short-circuits unless the route table has grown since the last pass.
   */
  public prepareRoutes(): void {
    const routes = this.gRouter.routes;

    if (this.fInstrumentedRoutes === routes.length) {
      return;
    }

    this.fInstrumentedRoutes = routes.length;

    const globals = new Set(this.gGlobalMiddlewares.middlewares.map((entry) => entry.middleware));

    for (const route of routes) {
      if (isUnderMount(route.path, this.gOptions.path)) {
        this.detachGlobalMiddlewares(route.handler, globals);
        continue;
      }

      this.instrumentHandler(route.handler);

      for (const definition of route.handler.middlewares?.beforeMiddlewares ?? []) {
        this.instrumentMiddleware(definition, 'onRequest', 'middleware:before');
      }

      for (const definition of route.handler.middlewares?.afterMiddlewares ?? []) {
        this.instrumentMiddleware(definition, 'onResponse', 'middleware:after');
      }
    }
  }

  /**
   * Removes the application's global middlewares from a route's chain.
   * @param handler router handler whose chain should be trimmed
   * @param globals middleware classes registered application-wide
   */
  private detachGlobalMiddlewares(handler: RouterTypes.RouterHandler, globals: ReadonlySet<unknown>): void {
    const chain = handler.middlewares;

    if (!chain) {
      return;
    }

    const isGlobal = (definition: RouterTypes.MiddlewareDefinition): boolean =>
      globals.has((definition.middleware as object)?.constructor);

    chain.beforeMiddlewares = chain.beforeMiddlewares.filter((definition) => !isGlobal(definition));
    chain.afterMiddlewares = chain.afterMiddlewares.filter((definition) => !isGlobal(definition));
  }

  /**
   * Creates the mutable trace for an incoming request.
   * @param request incoming request
   * @param url parsed request URL
   * @returns a fresh active trace
   */
  private createTrace(request: Request, url: URL): ActiveTrace {
    const matched = this.safeResolve(request.method, url.pathname);
    const instance = matched?.data?.instance as object | undefined;

    return {
      origin: performance.now(),
      requestBody: this.readRequestBody(request),
      record: {
        id: String(this.fNextId++),
        method: request.method,
        path: url.pathname,
        query: this.readQuery(url.searchParams),
        status: 0,
        durationMs: 0,
        startedAt: Date.now(),
        controller: instance?.constructor?.name,
        handler: matched?.data?.propertyName,
        matched: Boolean(matched),
        spans: [],
        requestHeaders: this.readHeaders(request.headers),
        responseHeaders: {},
      },
    };
  }

  /**
   * Resolves a route without throwing.
   * @param method HTTP method
   * @param path request pathname
   * @returns the matched route, or `undefined`
   */
  private safeResolve(method: string, path: string): RouterTypes.RouteMatched<RouterTypes.RouterHandler> | undefined {
    try {
      return this.gRouter.resolve({ method, path });
    } catch {
      return undefined;
    }
  }

  /**
   * Finalises a trace with the response the client will receive.
   * @param trace active trace
   * @param response final response
   */
  private complete(trace: ActiveTrace, response: Response, body?: Promise<DevtoolsTypes.Payload>): void {
    trace.record.durationMs = this.round(performance.now() - trace.origin);
    trace.record.status = response.status;
    trace.record.responseHeaders = this.readHeaders(response.headers);
    this.push(trace.record);
    this.attachBodies(trace, body);
  }

  /**
   * Finalises a trace whose request threw before producing a response.
   * @param trace active trace
   * @param error thrown value
   */
  private fail(trace: ActiveTrace, error: unknown): void {
    trace.record.durationMs = this.round(performance.now() - trace.origin);
    trace.record.status = 500;
    trace.record.error = this.describeError(error);
    this.push(trace.record);
    this.attachBodies(trace);
  }

  /**
   * Attaches body previews once they resolve, then republishes the record.
   * @param trace active trace
   * @param response pending response body preview, when one was started
   */
  private attachBodies(trace: ActiveTrace, response?: Promise<DevtoolsTypes.Payload>): void {
    if (!trace.requestBody && !response) {
      return;
    }

    const unreadable = (): DevtoolsTypes.Payload => this.omitted(null, 'unreadable');

    void Promise.all([trace.requestBody?.catch(unreadable), response?.catch(unreadable)]).then(([request, responseBody]) => {
      if (request) {
        trace.record.requestBody = request;
      }

      if (responseBody) {
        trace.record.responseBody = responseBody;
      }

      if (this.fRecords.includes(trace.record)) {
        this.gEventBus.publish({ type: 'request', payload: trace.record });
      }
    });
  }

  /**
   * Appends a finished record to the ring buffer and broadcasts it.
   * @param record completed request record
   */
  private push(record: DevtoolsTypes.RequestRecord): void {
    this.fRecords.push(record);

    while (this.fRecords.length > this.gOptions.maxRequests) {
      this.fRecords.shift();
    }

    this.gEventBus.publish({ type: 'request', payload: record });
  }

  /**
   * Records a span on the in-flight request trace, if any.
   * @param name span label
   * @param kind lifecycle phase the span belongs to
   * @param startedAt high resolution timestamp taken before the call
   */
  private addSpan(name: string, kind: DevtoolsTypes.Span['kind'], startedAt: number): void {
    const trace = this.fStorage.getStore();

    if (!trace) {
      return;
    }

    trace.record.spans.push({
      name,
      kind,
      offsetMs: this.round(startedAt - trace.origin),
      durationMs: this.round(performance.now() - startedAt),
    });
  }

  /**
   * Attaches the current error to the in-flight trace.
   * @param error thrown value
   */
  private noteError(error: unknown): void {
    const trace = this.fStorage.getStore();

    if (trace && !trace.record.error) {
      trace.record.error = this.describeError(error);
    }
  }

  /**
   * Wraps a middleware lifecycle method with span recording.
   * @param definition resolved middleware definition held by the route
   * @param method lifecycle method to wrap
   * @param kind span kind produced by this method
   */
  private instrumentMiddleware(
    definition: RouterTypes.MiddlewareDefinition,
    method: 'onRequest' | 'onResponse',
    kind: DevtoolsTypes.Span['kind'],
  ): void {
    const middleware = definition.middleware as unknown as Record<string, unknown>;
    const original = middleware?.[method];

    if (typeof original !== 'function' || isInstrumented(original)) {
      return;
    }

    const name = (definition.middleware as object)?.constructor?.name ?? 'Middleware';
    const addSpan = this.addSpan.bind(this);
    const noteError = this.noteError.bind(this);

    const wrapped = async function instrumentedMiddleware(this: unknown, ...args: unknown[]): Promise<unknown> {
      const startedAt = performance.now();

      try {
        return await (original as (...a: unknown[]) => unknown).apply(this, args);
      } catch (error) {
        noteError(error);
        throw error;
      } finally {
        addSpan(name, kind, startedAt);
      }
    };

    middleware[method] = markInstrumented(wrapped);
  }

  /**
   * Wraps a controller handler method with span recording.
   * @param handler router handler entry
   */
  private instrumentHandler(handler: RouterTypes.RouterHandler): void {
    const instance = handler.instance as Record<string, unknown> | undefined;
    const original = instance?.[handler.propertyName];

    if (!instance || typeof original !== 'function' || isInstrumented(original)) {
      return;
    }

    const name = `${instance.constructor?.name ?? 'Controller'}.${handler.propertyName}`;
    const addSpan = this.addSpan.bind(this);
    const noteError = this.noteError.bind(this);

    const wrapped = async function instrumentedHandler(this: unknown, ...args: unknown[]): Promise<unknown> {
      const startedAt = performance.now();

      try {
        return await (original as (...a: unknown[]) => unknown).apply(this, args);
      } catch (error) {
        noteError(error);
        throw error;
      } finally {
        addSpan(name, 'handler', startedAt);
      }
    };

    instance[handler.propertyName] = markInstrumented(wrapped);
  }

  /**
   * Converts a thrown value into a serialisable error description.
   * @param error thrown value
   * @returns error name, message and stack
   */
  private describeError(error: unknown): DevtoolsTypes.RequestRecord['error'] {
    if (error instanceof Error) {
      return { name: error.name, message: error.message, stack: error.stack };
    }

    return { name: 'Error', message: String(error) };
  }

  /**
   * Builds a payload that carries no text, only the omission reason.
   * @param contentType declared content type, when known
   * @param omitted why the body is not being shown
   * @param size body size in bytes, when known
   * @returns the placeholder payload
   */
  private omitted(contentType: string | null, omitted: DevtoolsTypes.PayloadOmission, size = 0): DevtoolsTypes.Payload {
    return { contentType, size, truncated: false, omitted };
  }

  /**
   * Starts reading a preview of the incoming request body from a clone.
   * @param request incoming request
   * @returns pending payload, or `undefined` when the request carries no body
   */
  private readRequestBody(request: Request): Promise<DevtoolsTypes.Payload> | undefined {
    if (!this.gOptions.captureBodies || !request.body || request.method === 'GET' || request.method === 'HEAD') {
      return undefined;
    }

    return this.readBody(request.clone(), request.headers);
  }

  /**
   * Starts reading a preview of the outgoing response body. Must be called synchronously.
   * @param response outgoing response
   * @returns pending payload, or `undefined` when the response carries no body
   */
  private readResponseBody(response: Response): Promise<DevtoolsTypes.Payload> | undefined {
    if (!this.gOptions.captureBodies || !response.body) {
      return undefined;
    }

    const contentType = response.headers.get('content-type');

    if (contentType?.includes('text/event-stream')) {
      return Promise.resolve(this.omitted(contentType, 'streaming'));
    }

    return this.readBody(response.clone(), response.headers);
  }

  /**
   * Reads a message body into a capped, decoded preview.
   * @param message a clone of the request or response
   * @param headers headers of the original message
   * @returns the payload preview
   */
  private async readBody(message: Request | Response, headers: Headers): Promise<DevtoolsTypes.Payload> {
    const contentType = headers.get('content-type');
    const declared = Number.parseInt(headers.get('content-length') ?? '', 10);

    if (Number.isFinite(declared) && declared > this.gOptions.maxBodyBytes) {
      return this.omitted(contentType, 'too-large', declared);
    }

    const { bytes, size } = await this.readCapped(message);

    if (size === 0) {
      return this.omitted(contentType, 'empty');
    }

    if (!this.isTextual(contentType)) {
      return this.omitted(contentType, 'binary', size);
    }

    if (size > this.gOptions.maxBodyBytes) {
      const head = new TextDecoder().decode(bytes);
      return { contentType, size, text: head.replace(/�+$/, ''), truncated: true };
    }

    try {
      const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
      return { contentType, size, text, truncated: false };
    } catch {
      return this.omitted(contentType, 'binary', size);
    }
  }

  /**
   * Streams a message body, keeping at most `maxBodyBytes` of it in memory.
   * The rest is drained rather than cancelled, so `size` stays exact and the
   * clone never makes the tee buffer grow.
   * @param message a clone of the request or response
   * @returns the captured prefix and the total byte size
   */
  private async readCapped(message: Request | Response): Promise<{ bytes: Uint8Array; size: number }> {
    const reader = message.body?.getReader();

    if (!reader) {
      return { bytes: new Uint8Array(0), size: 0 };
    }

    const limit = this.gOptions.maxBodyBytes;
    const chunks: Uint8Array[] = [];
    let captured = 0;
    let size = 0;

    try {
      for (;;) {
        const { value, done } = await reader.read();

        if (done) {
          break;
        }

        size += value.byteLength;

        if (captured < limit) {
          const slice = value.subarray(0, limit - captured);
          chunks.push(slice);
          captured += slice.byteLength;
        }
      }
    } finally {
      reader.releaseLock();
    }

    const bytes = new Uint8Array(captured);
    let offset = 0;

    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }

    return { bytes, size };
  }

  /**
   * @param contentType declared content type, when any
   * @returns whether the body should be decoded as text
   */
  private isTextual(contentType: string | null): boolean {
    if (!contentType) {
      return true;
    }

    const normalized = contentType.toLowerCase();
    return TEXT_CONTENT_TYPES.some((candidate) => normalized.includes(candidate));
  }

  /**
   * Copies query parameters, redacting credential-bearing names.
   * `?access_token=…` in a recorded URL is as sensitive as an `Authorization` header.
   * @param params parsed query string
   * @returns plain object with sensitive values replaced
   */
  private readQuery(params: URLSearchParams): Record<string, string> {
    const extra = new Set(this.gOptions.redactHeaders.map((header) => header.toLowerCase()));
    const result: Record<string, string> = {};

    for (const [key, value] of params.entries()) {
      const name = key.toLowerCase();
      result[key] = isSecretKey(key) || REDACTED_HEADERS.has(name) || extra.has(name) ? '<redacted>' : value;
    }

    return result;
  }

  /**
   * Copies headers, redacting credential-bearing names.
   * @param headers headers to read
   * @returns plain object with sensitive values replaced
   */
  private readHeaders(headers: Headers): Record<string, string> {
    if (!this.gOptions.captureHeaders) {
      return {};
    }

    const extra = new Set(this.gOptions.redactHeaders.map((header) => header.toLowerCase()));
    const result: Record<string, string> = {};

    for (const [key, value] of headers.entries()) {
      const name = key.toLowerCase();
      result[name] = REDACTED_HEADERS.has(name) || extra.has(name) ? '<redacted>' : value;
    }

    return result;
  }

  /**
   * Rounds a millisecond duration to three decimals.
   * @param value raw duration
   * @returns duration rounded to three decimals
   */
  private round(value: number): number {
    return Math.round(value * 1000) / 1000;
  }
}
