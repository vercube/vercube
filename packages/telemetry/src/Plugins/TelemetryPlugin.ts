import { context, propagation, trace } from '@opentelemetry/api';
import { BasePlugin, RequestContext, resolveTelemetryOptions, TelemetryRegistry } from '@vercube/core';
import { Logger } from '@vercube/logger';
import { bootstrapRecorder } from '../Bootstrap/BootstrapSpans';
import { INSTRUMENTATION_SCOPE } from '../Common/Attributes';
import { W3CTraceContextPropagator } from '../Common/Propagation';
import { Telemetry } from '../Common/Telemetry';
import { VercubeContextManager } from '../Context/VercubeContextManager';
import { CoreTelemetryHooks } from '../Hooks/CoreTelemetryHooks';
import { installOtlpLogs, installTraceCorrelation } from '../Hooks/TraceCorrelation';
import { installProcessMetrics } from '../Metrics/ProcessMetrics';
import { OtelTelemetry } from '../Service/OtelTelemetry';
import type { App, ConfigTypes, TelemetryTypes } from '@vercube/core';

/**
 * Activates OpenTelemetry instrumentation for the application.
 *
 * Register it in `vercube.config.ts`:
 *
 * ```ts
 * export default defineConfig({
 *   telemetry: true,
 *   plugins: [TelemetryPlugin],
 * });
 * ```
 *
 * The plugin only wires the OpenTelemetry **API**: it registers a context
 * manager and a W3C propagator, binds the {@link Telemetry} token and installs
 * the hooks core calls into. Producing actual spans additionally requires a
 * `TracerProvider`, which either the application registers through the standard
 * OpenTelemetry SDK, `@vercube/telemetry/sdk`, or `@vercube/devtools`.
 *
 * Options given at registration time win over the `telemetry` field of the
 * application config.
 */
export class TelemetryPlugin extends BasePlugin<TelemetryTypes.Options> {
  /** @inheritdoc */
  public override name = 'TelemetryPlugin';

  /**
   * Starts watching container construction.
   *
   * This runs while the config is still being loaded, which is the only phase
   * early enough: by the time `use()` runs the container has already built a
   * good part of the application. Registering the plugin through
   * `defineConfig({ plugins })` rather than `app.addPlugin()` is therefore what
   * makes bootstrap spans complete.
   *
   * @param config - The merged configuration
   * @param options - Options overriding the `telemetry` config field
   */
  public override configure(config: ConfigTypes.Config, options?: TelemetryTypes.Options): void {
    const resolved = resolveTelemetryOptions({ ...config, telemetry: { ...normalize(config.telemetry), ...options } });

    if (resolved.enabled && resolved.spans?.di !== false) {
      bootstrapRecorder.install();
    }
  }

  /**
   * Installs telemetry into the running application.
   *
   * @param app - The application
   * @param options - Options overriding the `telemetry` config field
   */
  public override use(app: App, options?: TelemetryTypes.Options): void | Promise<void> {
    const resolved = resolveTelemetryOptions({
      ...app.config,
      telemetry: { ...normalize(app.config.telemetry), ...options },
    });

    if (!resolved.enabled) {
      return;
    }

    const container = app.container;
    const logger = container.getOptional(Logger);

    // Bound automatically whenever telemetry is enabled, but an application can
    // build its container by hand - fail loudly rather than silently losing
    // every parent/child relationship.
    let requestContext = container.getOptional(RequestContext);

    if (!requestContext) {
      container.bind(RequestContext);
      requestContext = container.get(RequestContext);
    }

    // Process-wide registration. Two Vercube apps in one process share the
    // context manager and the propagator; the first one to start wins.
    context.setGlobalContextManager(new VercubeContextManager(requestContext).enable());
    propagation.setGlobalPropagator(new W3CTraceContextPropagator());

    const telemetry = new OtelTelemetry(INSTRUMENTATION_SCOPE);
    container.bindInstance(Telemetry, telemetry);

    container.get(TelemetryRegistry).install(new CoreTelemetryHooks(telemetry, resolved), resolved);

    // Bootstrap keeps running until the container has built everything the
    // first request needs, so the buffered constructions are replayed from the
    // first request rather than from here.
    if (resolved.spans?.di !== false) {
      bootstrapRecorder.install();
    }

    if (resolved.metrics !== false) {
      installProcessMetrics(telemetry);
    }

    // Whatever provider the application ended up with, flushing it is what
    // `Telemetry.flush()` has to reach.
    telemetry.onFlush(async () => {
      await (trace.getTracerProvider() as { forceFlush?: () => Promise<void> }).forceFlush?.();
    });

    // Every log line gets the ids of the span that was active when it was
    // written, which is what makes logs and traces line up in any backend.
    if (logger) {
      installTraceCorrelation(logger);
    }

    logger?.debug('TelemetryPlugin', 'OpenTelemetry instrumentation installed');

    if (logger && resolved.logs) {
      return installOtlpLogs(logger, { endpoint: resolved.endpoint }).then((flush) => {
        telemetry.onFlush(flush);
      });
    }
  }
}

/**
 * Turns the shorthand `telemetry: boolean` form into an options object.
 *
 * @param value - The raw config value
 * @returns The equivalent options object
 */
function normalize(value: boolean | TelemetryTypes.Options | undefined): TelemetryTypes.Options {
  if (value === undefined) {
    return {};
  }

  return typeof value === 'boolean' ? { enabled: value } : value;
}
