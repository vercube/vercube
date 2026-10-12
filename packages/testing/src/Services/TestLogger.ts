import { Logger } from '@vercube/logger';
import { render } from '../Utils/Format';
import type { TestingTypes } from '../Types/TestingTypes';
import type { EvlogPlugin, LoggerTypes } from '@vercube/logger';

/** What a logger and its children share. */
interface Store {
  records: TestingTypes.LogRecord[];
  providers: Set<LoggerTypes.ContextProvider>;
  print: { enabled: boolean };
}

/**
 * A {@link Logger} that keeps what it is given instead of writing it out, so a
 * test can assert on it.
 *
 * Children share the records of the logger they were created from, with their
 * context merged in. Drains, enrichers and plugins are accepted and ignored:
 * nothing is emitted through evlog.
 *
 * @example
 * ```ts
 * const app = await createTestApp({ controllers: [UserController] });
 *
 * await app.post('/users').json({}).expect(400);
 *
 * expect(app.logs.find('warn', /validation/i)).toBeDefined();
 * ```
 */
export class TestLogger extends Logger {
  /** Shared with children. */
  private readonly fStore: Store;

  /** Context of this logger. */
  private fContext: LoggerTypes.Context;

  /**
   * @param context - Initial context
   * @param store - Records shared with the parent, for children
   */
  constructor(context: LoggerTypes.Context = {}, store?: Store) {
    super();
    this.fContext = { ...context };
    this.fStore = store ?? { records: [], providers: new Set(), print: { enabled: false } };
  }

  /** Everything logged so far, oldest first, by this logger and its children. */
  public get records(): ReadonlyArray<TestingTypes.LogRecord> {
    return this.fStore.records;
  }

  /** Mirrors every record to the console as well. Handy while debugging a test. */
  public get print(): boolean {
    return this.fStore.print.enabled;
  }

  public set print(value: boolean) {
    this.fStore.print.enabled = value;
  }

  /**
   * Finds the first record matching.
   *
   * @param level - Severity to look at, every one when omitted
   * @param match - Substring of the message, RegExp, or predicate
   * @returns The record, or undefined
   *
   * @example
   * ```ts
   * app.logs.find('error', 'payment failed');
   * app.logs.find(undefined, (record) => record.context.userId === '1');
   * ```
   */
  public find(level?: TestingTypes.LogLevel, match?: TestingTypes.LogMatch): TestingTypes.LogRecord | undefined {
    return this.fStore.records.find((record) => matches(record, level, match));
  }

  /**
   * Finds every record matching.
   *
   * @param level - Severity to look at, every one when omitted
   * @param match - Substring of the message, RegExp, or predicate
   * @returns The records, oldest first
   */
  public filter(level?: TestingTypes.LogLevel, match?: TestingTypes.LogMatch): TestingTypes.LogRecord[] {
    return this.fStore.records.filter((record) => matches(record, level, match));
  }

  /** Forgets every record. */
  public clear(): void {
    this.fStore.records.length = 0;
  }

  /** @inheritdoc */
  public debug(...args: LoggerTypes.Arg[]): void {
    this.record('debug', args);
  }

  /** @inheritdoc */
  public info(...args: LoggerTypes.Arg[]): void {
    this.record('info', args);
  }

  /** @inheritdoc */
  public warn(...args: LoggerTypes.Arg[]): void {
    this.record('warn', args);
  }

  /** @inheritdoc */
  public error(...args: LoggerTypes.Arg[]): void {
    this.record('error', args);
  }

  /** @inheritdoc */
  public set(context: LoggerTypes.Context): void {
    this.fContext = { ...this.fContext, ...context };
  }

  /** @inheritdoc */
  public getContext(): LoggerTypes.Context {
    return { ...this.fContext };
  }

  /** @inheritdoc */
  public child(context: LoggerTypes.Context): Logger {
    return new TestLogger({ ...this.fContext, ...context }, this.fStore);
  }

  /**
   * Records the accumulated context as a `wide-event` record, then resets it.
   *
   * @param overrides - Fields merged into the event
   */
  public emit(overrides?: LoggerTypes.Context): void {
    this.record('wide-event', [], overrides);
    this.fContext = {};
  }

  /** @inheritdoc */
  public addContextProvider(provider: LoggerTypes.ContextProvider): () => void {
    this.fStore.providers.add(provider);
    return () => this.fStore.providers.delete(provider);
  }

  /** Accepted and ignored. */
  public configure(_options: LoggerTypes.Options): void {}

  /** Accepted and ignored. */
  public addPlugin(_plugin: EvlogPlugin): void {}

  /** Accepted and ignored. */
  public addDrain(_name: string, _drain: NonNullable<EvlogPlugin['drain']>): void {}

  /** Accepted and ignored. */
  public addEnricher(_name: string, _enrich: NonNullable<EvlogPlugin['enrich']>): void {}

  /**
   * Stores one record.
   *
   * @param level - Severity
   * @param args - Arguments as given
   * @param extra - Context merged over the logger's own
   */
  private record(level: TestingTypes.LogLevel, args: unknown[], extra?: LoggerTypes.Context): void {
    const provided: LoggerTypes.Context = {};

    for (const provider of this.fStore.providers) {
      Object.assign(provided, provider());
    }

    const record: TestingTypes.LogRecord = {
      level,
      args,
      message: args.map((arg) => render(arg)).join(' '),
      context: { ...provided, ...this.fContext, ...extra },
      at: Date.now(),
    };

    this.fStore.records.push(record);

    if (this.fStore.print.enabled) {
      const method = level === 'wide-event' ? 'info' : level;
      // oxlint-disable-next-line no-console
      console[method](`[${level}]`, ...args, Object.keys(record.context).length > 0 ? record.context : '');
    }
  }
}

/**
 * Tells whether a record matches a level and a match.
 *
 * @param record - The record
 * @param level - Severity, any when undefined
 * @param match - Substring, RegExp or predicate, any when undefined
 * @returns True when it matches
 */
function matches(record: TestingTypes.LogRecord, level?: TestingTypes.LogLevel, match?: TestingTypes.LogMatch): boolean {
  if (level && record.level !== level) {
    return false;
  }

  if (match === undefined) {
    return true;
  }

  if (typeof match === 'string') {
    return record.message.includes(match);
  }

  if (match instanceof RegExp) {
    return match.test(record.message);
  }

  return match(record);
}
