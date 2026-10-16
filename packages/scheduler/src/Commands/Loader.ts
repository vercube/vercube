import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { SchedulerError } from '../Errors/SchedulerError';
import { AUTOSTART_ENV, liveManagers } from '../Utils/Registry';
import type { SchedulerManager } from '../Services/SchedulerManager';

/** Where the CLI finds the application. */
export interface LoadOptions {
  /** Directory the paths are relative to. */
  cwd: string;

  /** Built entry of the application, relative to `cwd`. */
  entry: string;

  /** Build the application first. */
  build: boolean;
}

/**
 * Boots the application without starting its server or its scheduler timers,
 * and returns its scheduler.
 *
 * The built entry is imported with `VERCUBE_LISTEN=0`, so `app.listen()` keeps
 * the server down, and the scheduler sees `VERCUBE_SCHEDULER_AUTOSTART=false`
 * and never arms a timer.
 *
 * @param options - Where the application is, and whether to build it first
 * @returns The scheduler of the application
 * @throws {SchedulerError} When there is no built entry, or it has no scheduler
 */
export async function loadScheduler(options: LoadOptions): Promise<SchedulerManager> {
  if (options.build) {
    const { build, createVercube } = await import('@vercube/devkit');
    const app = await createVercube({ build: { dts: false } });

    await build(app);
  }

  const entry = resolve(options.cwd, options.entry);

  if (!existsSync(entry)) {
    throw new SchedulerError(
      `No built application at ${entry}. Run "vercube build" first, pass --build, or point --entry at the built entry.`,
      'cli',
      undefined,
      { entry },
      false,
    );
  }

  process.env[AUTOSTART_ENV] = 'false';
  process.env.VERCUBE_LISTEN = '0';

  const before = new Set(liveManagers());

  await import(pathToFileURL(entry).href);

  const manager = liveManagers().find((candidate) => !before.has(candidate)) ?? liveManagers().at(-1);

  if (!manager) {
    throw new SchedulerError(
      `The application at ${entry} has no scheduler. Is SchedulerPlugin registered?`,
      'cli',
      undefined,
      { entry },
      false,
    );
  }

  return manager;
}
