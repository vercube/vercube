import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
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
 * @example
 * ```sh
 * vercube inspect
 * vercube inspect --section routes
 * vercube inspect --section routes,container
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
    const app = await createVercube({ build: { dts: false } });
    await build(app);

    const entry = resolve(app.config.build?.output?.dir ?? 'dist', this.entry);

    await new Promise<void>((done, fail) => {
      const child = spawn(process.execPath, [entry], {
        env: { ...process.env, VERCUBE_INSPECT: this.section ?? '*' },
        stdio: 'inherit',
      });

      child.on('error', fail);
      child.on('exit', (code) => (code === 0 ? done() : fail(new Error(`Inspect exited with code ${code}`))));
    });
  }
}
