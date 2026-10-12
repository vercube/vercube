import { afterEach, describe, expect, it, vi } from 'vitest';
import { SchedulerError } from '../../src/Errors/SchedulerError';
import { asError, toSchedulerError } from '../../src/Utils/Errors';
import { createInstanceId, isProduction, randomHex, readEnv } from '../../src/Utils/Runtime';

describe('Runtime', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('reads the environment of the process', () => {
    vi.stubEnv('SCHEDULER_TEST', 'yes');

    expect(readEnv('SCHEDULER_TEST')).toBe('yes');
  });

  it('falls back to Deno.env, and to nothing when Deno refuses', () => {
    vi.stubGlobal('Deno', { env: { get: (name: string) => (name === 'ONLY_IN_DENO' ? 'deno' : undefined) } });
    expect(readEnv('ONLY_IN_DENO')).toBe('deno');

    vi.stubGlobal('Deno', {
      env: {
        get: () => {
          throw new Error('Requires env access');
        },
      },
    });
    expect(readEnv('ONLY_IN_DENO')).toBeUndefined();
  });

  it('tells production from the rest', () => {
    vi.stubEnv('NODE_ENV', 'production');
    expect(isProduction()).toBe(true);

    vi.stubEnv('NODE_ENV', 'test');
    expect(isProduction()).toBe(false);
  });

  it('creates random hex strings', () => {
    expect(randomHex(4)).toMatch(/^[0-9a-f]{8}$/);
    expect(randomHex(4)).not.toBe(randomHex(4));
  });

  it('builds the instance id from HOSTNAME, then the os host name', () => {
    vi.stubEnv('HOSTNAME', 'pod-1');
    expect(createInstanceId()).toMatch(new RegExp(`^pod-1-${process.pid}-[0-9a-f]{4}$`));

    vi.stubEnv('HOSTNAME', '');
    vi.spyOn(process, 'getBuiltinModule').mockReturnValue({ hostname: () => 'laptop' } as never);
    expect(createInstanceId()).toMatch(/^laptop-/);

    vi.spyOn(process, 'getBuiltinModule').mockImplementation(() => {
      throw new Error('not available');
    });
    expect(createInstanceId()).toMatch(/^vercube-/);
  });

  it('turns thrown values into errors', () => {
    const own = new SchedulerError('own', 'claim');
    const plain = new Error('plain');

    expect(toSchedulerError(own, 'wrapped', 'start')).toBe(own);
    expect(toSchedulerError(plain, 'wrapped', 'start')).toMatchObject({ message: 'wrapped', operation: 'start', cause: plain });
    expect(asError(plain)).toBe(plain);
    expect(asError(42).message).toBe('42');
  });
});
