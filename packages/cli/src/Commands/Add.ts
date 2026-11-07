import { relative, resolve } from 'pathe';
import { hasTTY, isCI } from 'std-env';
import { version } from '../../package.json';
import { BaseCommand } from '../BaseCommand';
import { Arg } from '../Decorators/Arg';
import { Command } from '../Decorators/Command';
import { Flag } from '../Decorators/Flag';
import { RECIPES } from '../Recipes/Catalog';
import { RecipeError } from '../Recipes/RecipeError';
import { addModules, projectPackageManager } from '../Scaffold/Add';
import { parseList } from '../Scaffold/Plan';
import { addRecipeFlags, logger, prompter, readRecipeFlags } from '../Scaffold/Prompter';

/* eslint-disable unicorn/no-process-exit */

/**
 * Adds modules to an existing project with the recipes `vercube init` uses:
 * dependencies, plugin registration, an example, env entries and the docker
 * compose services they need. Applying one twice changes nothing.
 *
 * @example
 * ```sh
 * vercube add queue --queue bullmq
 * vercube add schema,testing
 * vercube add @acme/vercube-search
 * ```
 */
@Command({
  name: 'add',
  description: 'Add modules to the project',
})
export class AddCommand extends BaseCommand {
  /** The modules, comma separated. */
  @Arg({
    name: 'modules',
    description: `Modules, comma separated (${RECIPES.map((recipe) => recipe.id).join(', ')}), or a package that ships a recipe`,
    required: false,
  })
  public modules!: string;

  /** Take the default for every question no flag answers. */
  @Flag({ name: 'yes', description: 'Use the defaults for everything not passed as a flag', default: false })
  public yes!: boolean;

  /** Set to `false` to skip installing what the modules need. */
  @Flag({ name: 'install', description: 'Install the dependencies the modules add', default: true })
  public install!: boolean;

  /** The project directory. */
  @Flag({ name: 'cwd', description: 'Project directory', type: 'string' })
  public cwd!: string;

  /**
   * @returns resolves once the modules are added
   */
  public override async run(): Promise<void> {
    const root = resolve(this.cwd ?? process.cwd());

    try {
      const summary = await addModules(parseList(this.modules ?? ''), {
        root,
        version,
        recipes: RECIPES,
        flags: readRecipeFlags(this),
        yes: this.yes,
        interactive: hasTTY && !isCI,
        prompter,
        packageManager: projectPackageManager(root),
        install: this.install,
        log: (message) => logger.info(message),
      });

      const changed = [...summary.created.map((file) => `+ ${file}`), ...summary.updated.map((file) => `~ ${file}`)];

      if (changed.length === 0) {
        logger.success(
          `Nothing to change: ${summary.applied.join(', ')} already set up in ${relative(process.cwd(), root) || '.'}`,
        );

        return;
      }

      logger.success(
        [
          `Added ${summary.applied.join(', ')}${summary.implied.length > 0 ? ` (${summary.implied.join(', ')} because another module needs it)` : ''}`,
          ...changed,
          ...summary.notes,
        ].join('\n  '),
      );
    } catch (error) {
      if (error instanceof RecipeError) {
        logger.error(error.message);
        process.exit(1);
      }

      throw error;
    }
  }
}

// one string flag per recipe question, `--queue`, `--scheduler-store` and so on
addRecipeFlags(AddCommand.prototype);
