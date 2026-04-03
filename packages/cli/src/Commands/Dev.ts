import { createDevServer, createVercube, watch } from '@vercube/devkit';
import { BaseCommand } from '../BaseCommand';
import { Command } from '../Decorators/Command';

/**
 * Starts the Vercube dev server with file watching and hot reload.
 *
 * @example
 * ```sh
 * vercube dev
 * ```
 */
@Command({
  name: 'dev',
  description: 'Start development server',
})
export class DevCommand extends BaseCommand {
  /**
   * @returns resolves when the watcher is ready
   */
  public override async run(): Promise<void> {
    const app = await createVercube();
    createDevServer(app);
    await watch(app);
  }
}
