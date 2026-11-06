import { spawn } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
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
 * @param entry - Entry file relative to the output directory
 * @returns Section id to section
 */
export async function inspect(
  app: DevKitTypes.App,
  sections: string[] = [],
  entry = 'index.mjs',
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

      child.on('error', fail);
      child.on('exit', (code) => (code === 0 ? done() : fail(new Error(`Inspect exited with code ${code}`))));
    });

    return JSON.parse(readFileSync(output, 'utf8')) as Record<string, DevKitTypes.InspectedSection>;
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}
