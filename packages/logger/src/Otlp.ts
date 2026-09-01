/**
 * OTLP log export, re-exported from evlog.
 *
 * Exposed as a subpath so applications and framework packages can ship logs to
 * an OpenTelemetry collector without adding evlog to their own dependencies.
 *
 * evlog's drain pipeline is re-exported alongside it: an OTLP drain without
 * batching sends one HTTP request per log line.
 *
 * ```ts
 * import { createDrainPipeline, createOTLPDrain } from '@vercube/logger/otlp';
 *
 * const pipeline = createDrainPipeline({ batch: { size: 50 } });
 *
 * logger.addDrain('otlp', pipeline(createOTLPDrain({ endpoint: 'http://localhost:4318' })));
 * ```
 *
 * @see https://evlog.dev
 */
export * from 'evlog/otlp';
export * from 'evlog/pipeline';
