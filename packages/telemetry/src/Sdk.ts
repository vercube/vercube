import { trace } from '@opentelemetry/api';
import { resourceFromAttributes } from '@opentelemetry/resources';
import {
  AlwaysOffSampler,
  AlwaysOnSampler,
  BatchSpanProcessor,
  NodeTracerProvider,
  ParentBasedSampler,
  TraceIdRatioBasedSampler,
} from '@opentelemetry/sdk-trace-node';
import type { Sampler, SpanExporter, SpanProcessor } from '@opentelemetry/sdk-trace-node';
import type { TelemetryTypes } from '@vercube/core';

/**
 * Options for {@link startNodeTelemetry}.
 */
export interface NodeTelemetryOptions {
  /** `service.name` resource attribute. */
  serviceName?: string;

  /** `service.version` resource attribute. */
  serviceVersion?: string;

  /** `deployment.environment.name` resource attribute. */
  environment?: string;

  /** Extra resource attributes. */
  resourceAttributes?: Record<string, string | number | boolean>;

  /** Head sampling strategy. Defaults to `parent`. */
  sampler?: TelemetryTypes.Sampler;

  /**
   * OTLP/HTTP endpoint, e.g. `http://localhost:4318`.
   *
   * Defaults to `OTEL_EXPORTER_OTLP_ENDPOINT`. When neither is set and no
   * `exporter` or `spanProcessors` are given, nothing is exported.
   */
  endpoint?: string;

  /** Headers sent with every OTLP request, for authenticated collectors. */
  headers?: Record<string, string>;

  /** A ready-made exporter, used instead of the OTLP one. */
  exporter?: SpanExporter;

  /** Extra span processors, appended after the exporting one. */
  spanProcessors?: SpanProcessor[];
}

/**
 * Handle returned by {@link startNodeTelemetry}.
 */
export interface NodeTelemetry {
  /** The registered provider. */
  provider: NodeTracerProvider;

  /** Flushes pending spans and shuts the provider down. */
  shutdown(): Promise<void>;
}

/**
 * Wires a Node tracer provider and registers it as the global one.
 *
 * `@vercube/telemetry` on its own only speaks the OpenTelemetry **API**, which
 * means no spans are recorded until something registers a provider. This is the
 * batteries-included way to do that:
 *
 * ```ts
 * import { startNodeTelemetry } from '@vercube/telemetry/sdk';
 *
 * const telemetry = await startNodeTelemetry({
 *   serviceName: 'checkout',
 *   endpoint: 'http://localhost:4318',
 * });
 * ```
 *
 * The context manager and the propagator are deliberately **not** registered
 * here: `TelemetryPlugin` already installed ones backed by Vercube's request
 * context, and letting the SDK replace them would open a second
 * `AsyncLocalStorage` per request.
 *
 * Call it before `createApp()` so bootstrap work is traced too.
 *
 * @param options - Resource, sampling and exporter settings
 * @returns Handle to the registered provider
 */
export async function startNodeTelemetry(options: NodeTelemetryOptions = {}): Promise<NodeTelemetry> {
  const processors: SpanProcessor[] = [];
  const exporter = options.exporter ?? (await createOtlpExporter(options));

  if (exporter) {
    processors.push(new BatchSpanProcessor(exporter));
  }

  if (options.spanProcessors) {
    processors.push(...options.spanProcessors);
  }

  const provider = new NodeTracerProvider({
    resource: resourceFromAttributes({
      'service.name': options.serviceName ?? process.env.OTEL_SERVICE_NAME ?? 'vercube',
      'service.version': options.serviceVersion,
      'deployment.environment.name': options.environment ?? process.env.NODE_ENV,
      ...options.resourceAttributes,
    }),
    sampler: toSampler(options.sampler),
    spanProcessors: processors,
  });

  // `contextManager` and `propagator` are explicitly null so `register()` keeps
  // the ones TelemetryPlugin installed instead of replacing them.
  provider.register({ contextManager: null, propagator: null });

  return {
    provider,
    shutdown: async () => {
      await provider.shutdown();
      trace.disable();
    },
  };
}

/**
 * Builds the OTLP/HTTP exporter, when an endpoint is configured.
 *
 * The exporter package is an optional peer dependency, so it is required
 * lazily and its absence produces an actionable message rather than a
 * module-resolution error at import time.
 *
 * @param options - The telemetry options
 * @returns The exporter, or undefined when no endpoint is configured
 */
async function createOtlpExporter(options: NodeTelemetryOptions): Promise<SpanExporter | undefined> {
  const endpoint = options.endpoint ?? process.env.OTEL_EXPORTER_OTLP_ENDPOINT;

  if (!endpoint) {
    return undefined;
  }

  let module: { OTLPTraceExporter: new (config: { url: string; headers?: Record<string, string> }) => SpanExporter };

  try {
    module = await import('@opentelemetry/exporter-trace-otlp-http');
  } catch {
    throw new Error(
      'An OTLP endpoint is configured but @opentelemetry/exporter-trace-otlp-http is not installed. ' +
        'Install it, or pass your own `exporter` to startNodeTelemetry().',
    );
  }

  return new module.OTLPTraceExporter({
    url: `${endpoint.replace(/\/$/, '')}/v1/traces`,
    headers: options.headers,
  });
}

/**
 * Translates the framework's sampler shorthand into an SDK sampler.
 *
 * @param sampler - The configured strategy
 * @returns The SDK sampler
 */
function toSampler(sampler: TelemetryTypes.Sampler = 'parent'): Sampler {
  if (sampler === 'always') {
    return new AlwaysOnSampler();
  }

  if (sampler === 'never') {
    return new AlwaysOffSampler();
  }

  if (sampler === 'parent') {
    return new ParentBasedSampler({ root: new AlwaysOnSampler() });
  }

  return new ParentBasedSampler({ root: new TraceIdRatioBasedSampler(sampler.ratio) });
}
