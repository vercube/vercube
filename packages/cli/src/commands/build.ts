import { build, createVercube } from '@vercube/devkit';
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
  }
}
