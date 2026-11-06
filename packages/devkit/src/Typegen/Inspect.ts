import { spawn } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join, resolve } from 'node:path';
import type { DevKitTypes } from '../Types/DevKitTypes';

/**
 * Runs the built application with introspection on and returns the sections.
 *
 * The application's own entry file is the only thing that knows what its
 * `setup` binds, so it is run, and stopped right before it would bind a port.
 * Its stdout goes to this process's stderr: an application may log while it
 * boots, and none of that belongs in the result. Build first.
 *
 * @param app - The devkit app
 * @param sections - Section ids; every section when empty
 * @param entry - Entry file relative to the output directory, the built application entry by default
 * @param timeout - Milliseconds before the run is stopped and the call rejects; 0 waits forever
 * @returns Section id to section
 */
export async function inspect(
  app: DevKitTypes.App,
  sections: string[] = [],
  entry = builtEntry(app),
  timeout = 0,
): Promise<Record<string, DevKitTypes.InspectedSection>> {
  const root = app.config.build?.root ?? process.cwd();
  const file = resolve(root, app.config.build?.output?.dir ?? 'dist', entry);
  const directory = mkdtempSync(join(tmpdir(), 'vercube-inspect-'));
  const output = join(directory, 'introspection.json');

  try {
    await new Promise<void>((done, fail) => {
      const child = spawn(process.execPath, [file], {
        cwd: root,
        env: {
          ...process.env,
          VERCUBE_INSPECT: sections.length > 0 ? sections.join(',') : '*',
          VERCUBE_INSPECT_OUT: output,
        },
        stdio: ['ignore', process.stderr, 'inherit'],
      });

      // an application whose setup waits on a service that never answers
      const timer =
        timeout > 0
          ? setTimeout(() => {
              child.kill('SIGKILL');
              fail(new Error(`Inspect did not finish within ${timeout / 1000}s`));
            }, timeout)
          : undefined;

      child.on('error', fail);
      child.on('exit', (code) => {
        clearTimeout(timer);

        if (code === 0) {
          done();
        } else {
          fail(new Error(`Inspect exited with code ${code}`));
        }
      });
    });

    return JSON.parse(readFileSync(output, 'utf8')) as Record<string, DevKitTypes.InspectedSection>;
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

/**
 * The file the build writes for the application's entry: `index.mjs` for a
 * single entry, named after the first file for a list of them, as rolldown
 * names them.
 *
 * @param app - The devkit app
 * @returns File name relative to the output directory
 */
export function builtEntry(app: DevKitTypes.App): string {
  const entry = app.config.build?.entry;

  if (!Array.isArray(entry) || entry.length === 0) {
    return 'index.mjs';
  }

  return `${basename(entry[0]).replace(/\.[^.]+$/, '')}.mjs`;
}
