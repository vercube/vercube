import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { loadScheduler } from '../../src/Commands/Loader';
import { AUTOSTART_ENV } from '../../src/Utils/Registry';

const devkit = vi.hoisted(() => ({ createVercube: vi.fn(async () => ({ config: {} })), build: vi.fn(async () => undefined) }));

vi.mock('@vercube/devkit', () => devkit);

const KEY = Symbol.for('vercube.scheduler.managers');

/**
 * Writes an application entry that registers a stand-in manager, the way a
 * built application with SchedulerPlugin would.
 *
 * @param registers - Whether the entry has a scheduler
 * @returns Directory and entry file name
 */
function writeEntry(registers: boolean): { cwd: string; entry: string } {
  const cwd = mkdtempSync(join(tmpdir(), 'vercube-scheduler-'));
  const body = registers
    ? `const key = Symbol.for('vercube.scheduler.managers');
globalThis[key] ??= new Set();
globalThis[key].add({ label: 'from-entry', autostart: process.env.${AUTOSTART_ENV}, listen: process.env.VERCUBE_LISTEN });`
    : 'export default {};';

  writeFileSync(join(cwd, 'index.mjs'), body);

  return { cwd, entry: 'index.mjs' };
}

describe('loadScheduler', () => {
  beforeEach(() => {
    (globalThis as unknown as Record<symbol, unknown>)[KEY] = new Set();
    vi.unstubAllEnvs();
  });

  afterEach(() => {
    delete process.env[AUTOSTART_ENV];
    delete process.env.VERCUBE_LISTEN;
  });

  it('imports the built entry with timers and the server off and returns the scheduler it created', async () => {
    const manager = await loadScheduler({ ...writeEntry(true), build: false });

    expect(manager).toEqual({ label: 'from-entry', autostart: 'false', listen: '0' });
    expect(devkit.build).not.toHaveBeenCalled();
  });

  it('builds the application first when asked', async () => {
    await loadScheduler({ ...writeEntry(true), build: true });

    expect(devkit.createVercube).toHaveBeenCalledWith({ build: { dts: false } });
    expect(devkit.build).toHaveBeenCalled();
  });

  it('explains a missing build', async () => {
    await expect(loadScheduler({ cwd: tmpdir(), entry: 'nope/index.mjs', build: false })).rejects.toThrow(
      /Run "vercube build" first/,
    );
  });

  it('explains an application without a scheduler', async () => {
    await expect(loadScheduler({ ...writeEntry(false), build: false })).rejects.toThrow(/Is SchedulerPlugin registered\?/);
  });
});
