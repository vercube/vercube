import { spawn } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { build, createVercube } from '@vercube/devkit';
import { BaseCommand } from '../BaseCommand';
import { Command } from '../Decorators/Command';
import { Flag } from '../Decorators/Flag';

/**
 * Prints the application's structure as JSON: routes, configuration, container
 * bindings, plugins and any other registered introspection section.
 *
 * The application's own entry file is built and run, because that is the only
 * thing that knows what its `setup` binds; it is stopped right before it would
 * bind a port.
 *
 * Only the JSON reaches stdout. Build progress and anything the application
 * logs while booting go to stderr, so the output can be piped.
 *
 * @example
 * ```sh
 * vercube inspect
 * vercube inspect --section routes
 * vercube inspect --section routes | jq '.routes.data | length'
 * ```
 */
@Command({
  name: 'inspect',
  description: 'Print the application structure as JSON',
})
export class InspectCommand extends BaseCommand {
  /** Entry file relative to the output directory. */
  @Flag({ name: 'entry', description: 'Entry point for the application', default: 'index.mjs' })
  public entry!: string;

  /** Comma-separated section ids. Every section when omitted. */
  @Flag({ name: 'section', description: 'Only print these sections (comma-separated)', type: 'string' })
  public section!: string | undefined;

  /**
   * @returns Resolves once the JSON has been printed
   */
  public override async run(): Promise<void> {
    const app = await onlyStderr(async () => {
      const instance = await createVercube({ build: { dts: false } });
      await build(instance);

      return instance;
    });

    const entry = resolve(app.config.build?.output?.dir ?? 'dist', this.entry);
    const directory = mkdtempSync(join(tmpdir(), 'vercube-inspect-'));
    const output = join(directory, 'introspection.json');

    try {
      await this.runEntry(entry, output);
      process.stdout.write(readFileSync(output, 'utf8'));
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  }

  /**
   * Runs the built entry with introspection enabled.
   *
   * The child's stdout is pointed at this process's stderr: an application is
   * free to log while it boots, and none of that belongs in the payload.
   *
   * @param entry - Absolute path of the built entry file
   * @param output - File the child writes the JSON to
   * @returns Resolves when the child exits successfully
   */
  private runEntry(entry: string, output: string): Promise<void> {
    return new Promise((done, fail) => {
      const child = spawn(process.execPath, [entry], {
        env: {
          ...process.env,
          VERCUBE_INSPECT: this.section ?? '*',
          VERCUBE_INSPECT_OUT: output,
        },
        stdio: ['ignore', process.stderr, 'inherit'],
      });

      child.on('error', fail);
      child.on('exit', (code) => (code === 0 ? done() : fail(new Error(`Inspect exited with code ${code}`))));
    });
  }
}

/**
 * Runs `fn` with everything written to stdout diverted to stderr.
 *
 * The build pipeline logs progress through several loggers, and reaching into
 * each of them to reconfigure it would be both fragile and incomplete.
 * Diverting the stream catches all of them.
 *
 * @param fn - The work to run
 * @returns Whatever `fn` returned
 */
async function onlyStderr<T>(fn: () => Promise<T>): Promise<T> {
  const write = process.stdout.write.bind(process.stdout);

  process.stdout.write = process.stderr.write.bind(process.stderr) as typeof process.stdout.write;

  try {
    return await fn();
  } finally {
    process.stdout.write = write;
  }
}
