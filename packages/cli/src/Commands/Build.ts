import { build, createVercube, typegen } from '@vercube/devkit';
import consola from 'consola';
import { BaseCommand } from '../BaseCommand';
import { Command } from '../Decorators/Command';
import { Flag } from '../Decorators/Flag';

/**
 * Builds the Vercube application for production.
 *
 * @example
 * ```sh
 * vercube build
 * vercube build --entry src/index.ts
 * ```
 */
@Command({
  name: 'build',
  description: 'Build the project',
})
export class BuildCommand extends BaseCommand {
  /** Custom entry file path. Uses default from vercube.config.ts when omitted. */
  @Flag({ name: 'entry', description: 'Entry file', type: 'string' })
  public entry!: string | undefined;

  /**
   * @returns resolves when the build is done
   */
  public override async run(): Promise<void> {
    const app = await createVercube({
      build: {
        entry: this.entry,
      },
    });

    await build(app);

    // the route map is a convenience; a project whose entry cannot boot
    // without its database still deserves a build
    try {
      await typegen(app);
    } catch (error) {
      consola.warn({ tag: 'typegen', message: `Route types not written: ${(error as Error).message}` });
    }
  }
}
