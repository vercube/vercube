import { build, createVercube, typegen } from '@vercube/devkit';
import { BaseCommand } from '../BaseCommand';
import { Command } from '../Decorators/Command';

/**
 * Writes the typed route map for `@vercube/client`.
 *
 * The application is built and its entry run with introspection on, stopped
 * right before it would bind a port, so the map lists the routes its `setup`
 * actually registers. Runs even when the project does not list
 * `@vercube/client`; set `build.typegen` to change where the file goes.
 *
 * @example
 * ```sh
 * vercube typegen
 * ```
 */
@Command({
  name: 'typegen',
  description: 'Write the typed route map for @vercube/client',
})
export class TypegenCommand extends BaseCommand {
  /**
   * @returns Resolves once the file is up to date
   */
  public override async run(): Promise<void> {
    const app = await createVercube({ build: { dts: false } });

    await build(app);

    const result = await typegen(app, { force: true });

    if (result && !result.written) {
      console.log(`Route types are up to date (${result.file})`);
    }
  }
}
