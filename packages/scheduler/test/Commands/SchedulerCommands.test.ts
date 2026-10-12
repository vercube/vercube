import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SchedulerCommand, SchedulerListCommand, SchedulerRunCommand } from '../../src/Commands/SchedulerCommands';
import { MemoryStore } from '../../src/Stores/MemoryStore';
import { ManualClock } from '../../src/Testing/ManualClock';
import { createReplica } from '../Utils/Harness';
import type { SchedulerManager } from '../../src/Services/SchedulerManager';

const loader = vi.hoisted(() => ({ loadScheduler: vi.fn() }));

vi.mock('../../src/Commands/Loader', () => loader);

describe('scheduler commands', () => {
  let manager: SchedulerManager;
  let exit: ReturnType<typeof vi.spyOn>;
  let log: ReturnType<typeof vi.spyOn>;

  beforeEach(async () => {
    ({ manager } = await createReplica({ clock: new ManualClock('2026-01-01T00:00:30Z') }, new MemoryStore()));
    manager.add({ name: 'ok', schedule: { every: '1m' }, handler: () => {} });
    manager.add({
      name: 'broken',
      schedule: { every: '1m' },
      handler: () => {
        throw new Error('boom');
      },
    });

    loader.loadScheduler.mockResolvedValue(manager);
    exit = vi.spyOn(process, 'exit').mockImplementation((() => undefined) as never);
    log = vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('lists the jobs of the application and exits', async () => {
    const command = Object.assign(new SchedulerListCommand(), { entry: 'out/main.mjs', build: true });
    const close = vi.spyOn(manager, 'close');

    await command.run();

    expect(loader.loadScheduler).toHaveBeenCalledWith({ cwd: process.cwd(), entry: 'out/main.mjs', build: true });
    expect(log.mock.calls[0][0]).toMatch(/^NAME\s+SCHEDULE/);
    expect(close).toHaveBeenCalled();
    expect(exit).toHaveBeenCalledWith(0);
  });

  it('runs a job, prints its result and exits with its code', async () => {
    await Object.assign(new SchedulerRunCommand(), { name: 'ok', force: false, entry: 'dist/index.mjs', build: false }).run();

    expect(JSON.parse(log.mock.calls[0][0] as string)).toMatchObject({ name: 'ok', outcome: 'completed' });
    expect(exit).toHaveBeenLastCalledWith(0);

    await Object.assign(new SchedulerRunCommand(), { name: 'broken', force: true, entry: 'dist/index.mjs', build: false }).run();

    expect(exit).toHaveBeenLastCalledWith(1);
  });

  it('groups the subcommands', async () => {
    await expect(new SchedulerCommand().run()).resolves.toBeUndefined();
  });
});
