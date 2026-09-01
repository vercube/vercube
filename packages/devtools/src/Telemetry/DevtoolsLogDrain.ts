import { toOTLPLogRecord } from '@vercube/logger/otlp';
import type { DevtoolsFrameBus } from '../Services/DevtoolsFrameBus';
import type { DrainContext, WideEvent } from '@vercube/logger';

/** Plugin name, used by evlog for de-duplication. */
export const DEVTOOLS_LOG_PLUGIN = 'vercube:devtools-logs';

/**
 * Keeps recent log events in memory and streams them to connected UIs.
 *
 * Registered as an evlog drain rather than by wrapping the `Logger` instance.
 * The old wrapper existed only because `initLogger` could not be called twice
 * without discarding the application's own configuration; now that
 * `Logger.addDrain` replays that configuration, devtools can sit in the log
 * pipeline like any other consumer - and it sees lines written through evlog
 * directly, which the wrapper never could.
 */
export class DevtoolsLogDrain {
  /** Recent events, oldest first. */
  private fEvents: WideEvent[] = [];

  /** Where events are published. */
  private readonly fBus: DevtoolsFrameBus;

  /** Ring buffer capacity. */
  private readonly fMaxEvents: number;

  /**
   * @param bus - Frame bus to publish on
   * @param options - Buffer size
   */
  constructor(bus: DevtoolsFrameBus, options: { maxEvents: number }) {
    this.fBus = bus;
    this.fMaxEvents = options.maxEvents;
  }

  /**
   * The drain callback to register with the logger.
   *
   * @param context - The drained event
   */
  public readonly drain = (context: DrainContext): void => {
    this.fEvents.push(context.event);

    while (this.fEvents.length > this.fMaxEvents) {
      this.fEvents.shift();
    }

    this.fBus.publish('log', toOtlpJson([context.event]));
  };

  /**
   * Buffered events as an OTLP/JSON export request.
   *
   * @returns The OTLP payload
   */
  public snapshot(): unknown {
    return toOtlpJson(this.fEvents);
  }

  /** Empties the buffer. */
  public clear(): void {
    this.fEvents = [];
  }
}

/**
 * Wraps wide events in an OTLP logs export request.
 *
 * evlog already knows how to turn one of its events into an OTLP log record,
 * including the `traceId` and `spanId` the correlation enricher put on it, so
 * the same records that would go to a collector go to the UI.
 *
 * @param events - The events to serialise
 * @returns The OTLP payload
 */
function toOtlpJson(events: WideEvent[]): unknown {
  if (events.length === 0) {
    return { resourceLogs: [] };
  }

  return {
    resourceLogs: [
      {
        resource: {
          attributes: [{ key: 'service.name', value: { stringValue: String(events[0].service ?? 'vercube') } }],
        },
        scopeLogs: [
          {
            scope: { name: '@vercube/logger' },
            logRecords: events.map((event) => toOTLPLogRecord(event)),
          },
        ],
      },
    ],
  };
}
