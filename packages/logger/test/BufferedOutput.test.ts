import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BufferedOutput } from '../src/Service/BufferedOutput';

/**
 * Waits for the end of the current turn of the event loop.
 *
 * @returns {Promise<void>} Resolves once queued immediates ran
 */
function nextTurn(): Promise<void> {
  return new Promise((done) => setImmediate(done));
}

describe('BufferedOutput', () => {
  let stdout: ReturnType<typeof vi.spyOn>;
  let stderr: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    stdout = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    stderr = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('is supported where there is a stdout to write to', () => {
    expect(BufferedOutput.supported()).toBe(true);
  });

  it('writes the lines of one turn of the event loop in one write', async () => {
    const output = new BufferedOutput();

    output.write('info', 'one');
    output.write('debug', 'two');
    output.write('info', 'three');

    expect(stdout).not.toHaveBeenCalled();

    await nextTurn();

    expect(stdout).toHaveBeenCalledTimes(1);
    expect(stdout).toHaveBeenCalledWith('one\ntwo\nthree\n', expect.any(Function));
    expect(stderr).not.toHaveBeenCalled();

    output.write('info', 'four');
    await nextTurn();

    expect(stdout).toHaveBeenCalledTimes(2);
    expect(stdout).toHaveBeenLastCalledWith('four\n', expect.any(Function));
  });

  it('sends warnings and errors to stderr, like console does', async () => {
    const output = new BufferedOutput();

    output.write('info', 'fine');
    output.write('warn', 'careful');
    output.write('error', 'broken');
    output.write('fatal', 'gone');

    await nextTurn();

    expect(stdout).toHaveBeenCalledWith('fine\n', expect.any(Function));
    expect(stderr).toHaveBeenCalledWith('careful\nbroken\ngone\n', expect.any(Function));
  });

  it('writes on demand and then has nothing left', async () => {
    const output = new BufferedOutput();

    output.write('info', 'now');
    output.flush();

    expect(stdout).toHaveBeenCalledWith('now\n', expect.any(Function));

    await nextTurn();

    expect(stdout).toHaveBeenCalledTimes(1);
  });

  it('writes synchronously when the process exits', () => {
    const writeSync = vi.fn();
    const getBuiltinModule = vi.spyOn(process, 'getBuiltinModule').mockReturnValue({ writeSync } as never);
    const once = vi.spyOn(process, 'once');
    const output = new BufferedOutput();

    output.write('info', 'last words');
    output.write('error', 'last error');

    const calls = once.mock.calls as unknown as [string, () => void][];
    const onExit = calls.find(([event]) => event === 'exit')![1];

    onExit();

    expect(getBuiltinModule).toHaveBeenCalledWith('node:fs');
    expect(writeSync).toHaveBeenCalledWith(process.stdout.fd, 'last words\n');
    expect(writeSync).toHaveBeenCalledWith(process.stderr.fd, 'last error\n');
    expect(stdout).not.toHaveBeenCalled();

    // installed once, however many lines are written
    output.write('info', 'more');
    expect(calls.filter(([event]) => event === 'exit')).toHaveLength(1);
  });

  it('falls back to the stream when a synchronous write is refused', () => {
    vi.spyOn(process, 'getBuiltinModule').mockReturnValue({
      writeSync: () => {
        throw new Error('EAGAIN');
      },
    } as never);

    const output = new BufferedOutput();

    output.write('info', 'kept');
    output.flushSync();

    expect(stdout).toHaveBeenCalledWith('kept\n', expect.any(Function));
  });

  it('falls back to the stream where there is no synchronous write', () => {
    vi.spyOn(process, 'getBuiltinModule').mockReturnValue(undefined as never);

    const output = new BufferedOutput();

    output.write('info', 'kept');
    output.flushSync();

    expect(stdout).toHaveBeenCalledWith('kept\n', expect.any(Function));
  });

  it('survives a stream that fails, now or later, like console does', async () => {
    const { PassThrough } = await import('node:stream');
    const broken = new PassThrough();
    const original = Object.getOwnPropertyDescriptor(process, 'stdout')!;

    broken.once('error', () => {});
    broken.destroy(new Error('EPIPE'));
    // the error of the destroyed stream is emitted here
    await nextTurn();

    Object.defineProperty(process, 'stdout', { value: broken, configurable: true });

    try {
      const output = new BufferedOutput();

      output.write('info', 'lost');
      output.flush();
      // an unhandled `error` event would throw from here
      await nextTurn();
      await nextTurn();

      expect(broken.listenerCount('error')).toBeLessThanOrEqual(1);

      vi.spyOn(broken, 'write').mockImplementation(() => {
        throw new Error('EBADF');
      });

      output.write('info', 'lost too');
      expect(() => output.flush()).not.toThrow();
    } finally {
      Object.defineProperty(process, 'stdout', original);
    }
  });
});
