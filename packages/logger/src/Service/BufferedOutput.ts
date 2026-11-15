/**
 * Levels evlog writes with `console.warn` and `console.error`, which go to
 * stderr. Everything else goes to stdout.
 */
const STDERR_LEVELS: ReadonlySet<string> = new Set(['warn', 'error', 'fatal']);

/** The part of a writable stream the output needs. */
interface OutputStream {
  write: (chunk: string) => unknown;
  fd?: number;
}

/** The part of `process` the output needs, absent outside Node, Bun and Deno. */
interface OutputProcess {
  stdout?: OutputStream;
  stderr?: OutputStream;
  once?: (event: 'exit', listener: () => void) => unknown;
  getBuiltinModule?: (id: string) => { writeSync?: (fd: number, chunk: string) => unknown } | undefined;
}

/**
 * Collects log lines and writes them once per turn of the event loop.
 *
 * A structured log line per request written with `console` is one synchronous
 * write per request, and under load that write is the single most expensive
 * thing a request does. Lines handed to this class within the same turn of
 * the event loop leave the process in one write instead, at the end of that
 * turn: a request served alone is logged as promptly as before, a hundred
 * served together cost one write.
 *
 * Lines are in memory for at most one turn. They are written synchronously
 * when the process exits, an uncaught exception included.
 */
export class BufferedOutput {
  /** Lines waiting for stdout. */
  private fOut: string = '';

  /** Lines waiting for stderr. */
  private fErr: string = '';

  /** Whether a flush is scheduled for the end of this turn. */
  private fScheduled: boolean = false;

  /** Whether the exit listener is installed. */
  private fGuarded: boolean = false;

  /** Bound once, so scheduling a flush allocates nothing. */
  private readonly fFlush = (): void => this.flush();

  /**
   * Whether this runtime has streams to write to and a way to defer a write.
   *
   * @returns {boolean} True on Node, Bun and Deno
   */
  public static supported(): boolean {
    const target = BufferedOutput.process();

    return typeof target?.stdout?.write === 'function' && typeof setImmediate === 'function';
  }

  /**
   * Queues a line.
   *
   * @param {string} level - The level of the event, which picks the stream
   * @param {string} line - The line, without a trailing newline
   * @returns {void}
   */
  public write(level: string, line: string): void {
    if (STDERR_LEVELS.has(level)) {
      this.fErr += `${line}\n`;
    } else {
      this.fOut += `${line}\n`;
    }

    if (!this.fScheduled) {
      this.fScheduled = true;
      this.guard();
      setImmediate(this.fFlush);
    }
  }

  /**
   * Writes what is queued.
   *
   * @returns {void}
   */
  public flush(): void {
    this.fScheduled = false;

    const target = BufferedOutput.process();

    if (this.fOut !== '') {
      const chunk = this.fOut;

      this.fOut = '';
      target?.stdout?.write(chunk);
    }

    if (this.fErr !== '') {
      const chunk = this.fErr;

      this.fErr = '';
      (target?.stderr ?? target?.stdout)?.write(chunk);
    }
  }

  /**
   * Writes what is queued before returning, for a process about to exit: a
   * write handed to a stream then may never happen.
   *
   * @returns {void}
   */
  public flushSync(): void {
    const target = BufferedOutput.process();
    const writeSync = target?.getBuiltinModule?.('node:fs')?.writeSync;

    if (typeof writeSync !== 'function') {
      this.flush();
      return;
    }

    for (const [chunk, stream] of [
      [this.fOut, target?.stdout],
      [this.fErr, target?.stderr],
    ] as const) {
      if (chunk === '') {
        continue;
      }

      try {
        writeSync(stream?.fd ?? 1, chunk);
      } catch {
        // a stream that cannot take a synchronous write right now
        stream?.write(chunk);
      }
    }

    this.fOut = '';
    this.fErr = '';
    this.fScheduled = false;
  }

  /**
   * Makes sure queued lines are written when the process exits.
   *
   * @returns {void}
   * @private
   */
  private guard(): void {
    if (this.fGuarded) {
      return;
    }

    this.fGuarded = true;
    BufferedOutput.process()?.once?.('exit', () => this.flushSync());
  }

  /**
   * The `process` global, when there is one.
   *
   * @returns {OutputProcess | undefined} The process
   * @private
   */
  private static process(): OutputProcess | undefined {
    return (globalThis as { process?: OutputProcess }).process;
  }
}
