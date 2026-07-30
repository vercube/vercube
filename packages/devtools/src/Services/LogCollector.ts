import { Inject } from '@vercube/di';
import { Logger } from '@vercube/logger';
import { $DevtoolsOptions } from '../Symbols/DevtoolsSymbols';
import { DevtoolsEventBus } from './DevtoolsEventBus';
import { RequestRecorder } from './RequestRecorder';
import type { DevtoolsTypes } from '../Types/DevtoolsTypes';
import type { LoggerTypes } from '@vercube/logger';

/** Marks an already wrapped logger. */
const INSTRUMENTED: unique symbol = Symbol('vercube.devtools.logger');

/** Logger methods that are captured. */
const LEVELS: readonly DevtoolsTypes.LogLevel[] = ['debug', 'info', 'warn', 'error'];

/**
 * Captures recent log lines and correlates each with the active request.
 */
export class LogCollector {
  @Inject($DevtoolsOptions)
  private readonly gOptions!: DevtoolsTypes.ResolvedOptions;

  @Inject(DevtoolsEventBus)
  private readonly gEventBus!: DevtoolsEventBus;

  @Inject(RequestRecorder)
  private readonly gRecorder!: RequestRecorder;

  /** Ring buffer of captured lines, oldest first. */
  private fEntries: DevtoolsTypes.LogEntry[] = [];

  /** Monotonically increasing id source. */
  private fNextId: number = 1;

  /**
   * Captured lines, newest first.
   * @returns snapshot of the ring buffer
   */
  public get entries(): DevtoolsTypes.LogEntry[] {
    return [...this.fEntries].reverse();
  }

  /**
   * Drops every captured line.
   */
  public clear(): void {
    this.fEntries = [];
  }

  /**
   * Wraps a logger so everything written through it is also recorded.
   * Child loggers returned by `logger.child()` are wrapped as well.
   * @param logger the logger to instrument
   * @returns the same logger, wrapped
   */
  public attach(logger: Logger): Logger {
    if (!this.gOptions.captureLogs || this.isInstrumented(logger)) {
      return logger;
    }

    const target = logger as unknown as Record<string, unknown>;

    for (const level of LEVELS) {
      const original = (logger[level] as (...args: LoggerTypes.Arg[]) => void).bind(logger);

      target[level] = (...args: LoggerTypes.Arg[]): void => {
        original(...args);
        this.record(level, args);
      };
    }

    const child = logger.child.bind(logger);
    target.child = (context: LoggerTypes.Context): Logger => this.attach(child(context));

    target[INSTRUMENTED as unknown as string] = true;

    return logger;
  }

  /**
   * Records one line. Must not throw.
   * @param level severity the line was written at
   * @param args the raw arguments the caller passed
   */
  private record(level: DevtoolsTypes.LogLevel, args: LoggerTypes.Arg[]): void {
    try {
      const entry: DevtoolsTypes.LogEntry = {
        id: String(this.fNextId++),
        level,
        at: Date.now(),
        requestId: this.gRecorder.activeRequestId,
        ...this.describe(args),
      };

      this.fEntries.push(entry);

      while (this.fEntries.length > this.gOptions.maxLogs) {
        this.fEntries.shift();
      }

      this.gEventBus.publish({ type: 'log', payload: entry });
    } catch {
      /* ignore describe failures */
    }
  }

  /**
   * Splits variadic logger arguments into a message and structured context.
   * @param args the raw arguments the caller passed
   * @returns the message and optional context
   */
  private describe(args: LoggerTypes.Arg[]): { message: string; context?: Record<string, unknown> } {
    const words: string[] = [];
    const context: Record<string, unknown> = {};

    for (const [index, arg] of args.entries()) {
      if (typeof arg === 'string') {
        words.push(arg);
        continue;
      }

      if (arg instanceof Error) {
        words.push(`${arg.name}: ${arg.message}`);
        context.stack = arg.stack;
        continue;
      }

      if (arg && typeof arg === 'object' && !Array.isArray(arg)) {
        Object.assign(context, arg);
        continue;
      }

      context[`arg${index}`] = arg;
    }

    return {
      message: words.join(' ') || '(no message)',
      context: Object.keys(context).length > 0 ? this.serialisable(context) : undefined,
    };
  }

  /**
   * Reduces a context object to something that survives `JSON.stringify`.
   * @param context structured fields collected from the call
   * @returns the same fields with unserialisable values described
   */
  private serialisable(context: Record<string, unknown>): Record<string, unknown> {
    const safe: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(context)) {
      try {
        JSON.stringify(value);
        safe[key] = value;
      } catch {
        safe[key] = `[unserialisable ${typeof value}]`;
      }
    }

    return safe;
  }

  /**
   * @param logger candidate logger
   * @returns true when the logger has already been wrapped
   */
  private isInstrumented(logger: Logger): boolean {
    return (logger as unknown as Record<symbol, boolean>)[INSTRUMENTED] === true;
  }
}
