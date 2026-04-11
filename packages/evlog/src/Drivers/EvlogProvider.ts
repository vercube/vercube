import { initLogger, log } from 'evlog';
import type { LoggerTypes } from '@vercube/logger';

/**
 * Options for configuring the Evlog provider.
 */
export interface EvlogProviderOptions {
  /**
   * Enable or disable all logging globally.
   * @default true
   */
  enabled?: boolean;

  /**
   * Environment context overrides.
   */
  env?: {
    service?: string;
    environment?: string;
    version?: string;
    commitHash?: string;
    region?: string;
  };

  /**
   * Enable pretty printing (auto-detected: true in dev, false in prod).
   */
  pretty?: boolean;

  /**
   * Sampling configuration for filtering logs.
   */
  sampling?: {
    rates?: {
      info?: number;
      warn?: number;
      debug?: number;
      error?: number;
    };
    keep?: Array<{
      status?: number;
      duration?: number;
      path?: string;
    }>;
  };

  /**
   * When pretty is disabled, emit JSON strings (default) or raw objects.
   * @default true
   */
  stringify?: boolean;

  /**
   * Suppress built-in console output.
   * @default false
   */
  silent?: boolean;

  /**
   * Drain callback called with every emitted event (fire-and-forget).
   */
  drain?: (ctx: {
    event: Record<string, unknown>;
    request?: { method?: string; path?: string; requestId?: string };
  }) => void | Promise<void>;
}

/**
 * Evlog provider for structured wide-event logging.
 * Uses the evlog library (https://evlog.dev) under the hood.
 *
 * Implements the LoggerProvider interface from @vercube/logger.
 */
export class EvlogProvider {
  /**
   * Whether evlog has been initialized.
   */
  private fInitialized = false;

  /**
   * Initializes the evlog logger with the provided options.
   * @param options - Configuration options for evlog
   */
  public initialize(options?: EvlogProviderOptions): void {
    initLogger({
      enabled: options?.enabled,
      env: options?.env,
      pretty: options?.pretty,
      sampling: options?.sampling,
      stringify: options?.stringify,
      silent: options?.silent,
      drain: options?.drain,
    });
    this.fInitialized = true;
  }

  /**
   * Processes a log message by forwarding it to evlog's log API.
   * When request-scoped context is present (via Logger.setContext), it is merged into every event.
   * @param message - The log message to process
   */
  public processMessage(message: LoggerTypes.Message): void {
    if (!this.fInitialized) {
      initLogger();
      this.fInitialized = true;
    }

    const { level, args, tag, context } = message;
    const hasContext = context && Object.keys(context).length > 0;

    // When context is present, always use event-object form so context is included
    if (!hasContext) {
      // Fast paths without context — use evlog's native signatures
      if (tag && args.length > 0 && typeof args[0] === 'string') {
        log[level](tag, args[0]);
        return;
      }
      if (args.length === 1 && typeof args[0] === 'object' && args[0] !== null && !(args[0] instanceof Error)) {
        log[level](args[0] as Record<string, unknown>);
        return;
      }
      if (args.length === 2 && typeof args[0] === 'string' && typeof args[1] === 'string') {
        log[level](args[0], args[1]);
        return;
      }
    }

    // Build event object, merging context + args
    const event: Record<string, unknown> = { ...context };

    if (tag) {
      event.tag = tag;
    }

    if (message.timestamp) {
      event.timestamp = new Date(message.timestamp).toISOString();
    }

    if (message.pid) {
      event.pid = message.pid;
    }

    if (message.type) {
      event.type = message.type;
    }

    // Map args into the event
    const messageParts: string[] = [];
    for (const arg of args) {
      if (arg instanceof Error) {
        event.error = { message: arg.message, stack: arg.stack, name: arg.name };
      } else if (typeof arg === 'object' && arg !== null) {
        Object.assign(event, arg);
      } else {
        messageParts.push(String(arg));
      }
    }

    if (messageParts.length > 0) {
      event.message = messageParts.join(' ');
    }

    log[level](event);
  }
}
