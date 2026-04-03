import { existsSync } from 'node:fs';
import { consola } from 'consola';
import { colors } from 'consola/utils';
import { downloadTemplate, startShell } from 'giget';
import { installDependencies } from 'nypm';
import { relative, resolve } from 'pathe';
import { hasTTY } from 'std-env';
import { x } from 'tinyexec';
import { BaseCommand } from '../BaseCommand';
import { Arg } from '../Decorators/Arg';
import { Command } from '../Decorators/Command';
import { Flag } from '../Decorators/Flag';
import { vercubeIcon } from '../Utils/Logo';
import type { PackageManagerName } from 'nypm';

/* eslint-disable unicorn/no-process-exit */

const logger = consola.withTag(colors.whiteBright(colors.bold(colors.bgGreenBright(' vercube '))));
const DEFAULT_REGISTRY = 'https://raw.githubusercontent.com/vercube/starter/main/templates';
const DEFAULT_TEMPLATE_NAME = 'vercube';

const pms: Record<PackageManagerName, undefined> = {
  npm: undefined,
  pnpm: undefined,
  yarn: undefined,
  bun: undefined,
  deno: undefined,
};

const packageManagerOptions = Object.keys(pms) as PackageManagerName[];

/**
 * Scaffolds a new Vercube project from the official starter template.
 * Downloads the template, installs dependencies, and optionally inits a git repo.
 * Prompts interactively for missing options when running in a TTY.
 *
 * @example
 * ```sh
 * vercube init my-app
 * vercube init my-app --package-manager bun --no-git-init
 * vercube init --force
 * ```
 */
@Command({
  name: 'init',
  description: 'Initialize a new Vercube app',
})
export class InitCommand extends BaseCommand {
  /** Target directory. Prompted interactively when omitted. */
  @Arg({ name: 'dir', description: 'Project directory' })
  public dir!: string;

  /** Overwrite existing directory without prompting. */
  @Flag({ name: 'force', description: 'Override existing directory', default: false })
  public force!: boolean;

  /** Set to `false` to skip dependency installation. */
  @Flag({ name: 'install', description: 'Install dependencies', default: true })
  public install!: boolean;

  /** Run `git init` in the new project directory. */
  @Flag({ name: 'gitInit', description: 'Initialize git repository', default: true })
  public gitInit!: boolean;

  /** Package manager for dependency installation. */
  @Flag({ name: 'packageManager', description: 'Package manager choice (npm, pnpm, yarn, bun)', default: 'pnpm' })
  public packageManager!: string;

  /** Open an interactive shell in the project directory after scaffolding. */
  @Flag({ name: 'shell', description: 'Open shell in project directory', default: false })
  public shell!: boolean;

  /**
   * @returns resolves when scaffolding and setup are complete
   */
  public override async run(): Promise<void> {
    if (hasTTY) {
      process.stdout.write(`\n${vercubeIcon}\n\n`);
    }

    consola.info(`Welcome to ${colors.bold('Vercube')}!`);

    let dir = this.dir ?? '';

    if (!dir) {
      dir = await logger
        .prompt('Where would you like to create your project?', {
          placeholder: './vercube-app',
          type: 'text',
          default: 'vercube-app',
          cancel: 'reject',
        })
        .catch(() => process.exit(1));
    }

    const cwd = resolve(process.cwd());
    let templateDownloadPath = resolve(cwd, dir);
    logger.info(`Creating a new project in ${colors.cyan(relative(cwd, templateDownloadPath) || templateDownloadPath)}.`);

    let shouldForce = Boolean(this.force);

    const shouldVerify = !shouldForce && existsSync(templateDownloadPath);
    if (shouldVerify) {
      const selectedAction = await logger.prompt(
        `The directory ${colors.cyan(templateDownloadPath)} already exists. What would you like to do?`,
        {
          type: 'select',
          options: ['Override its contents', 'Select different directory', 'Abort'],
        },
      );

      switch (selectedAction) {
        case 'Override its contents': {
          shouldForce = true;
          break;
        }
        case 'Select different directory': {
          templateDownloadPath = resolve(
            cwd,
            await logger
              .prompt('Please specify a different directory:', {
                type: 'text',
                cancel: 'reject',
              })
              .catch(() => process.exit(1)),
          );
          break;
        }
        default: {
          process.exit(1);
        }
      }
    }

    let template: any;

    try {
      template = await downloadTemplate(DEFAULT_TEMPLATE_NAME, {
        dir: templateDownloadPath,
        force: shouldForce,
        registry: DEFAULT_REGISTRY,
      });
    } catch (error) {
      if (process.env.DEBUG) {
        throw error;
      }
      logger.error((error as Error).toString());
      process.exit(1);
    }

    const packageManagerArg = this.packageManager as PackageManagerName;
    const selectedPackageManager = packageManagerOptions.includes(packageManagerArg)
      ? packageManagerArg
      : await logger
          .prompt('Which package manager would you like to use?', {
            type: 'select',
            options: packageManagerOptions,
            cancel: 'reject',
          })
          .catch(() => process.exit(1));

    if (this.install === false) {
      logger.info('Skipping install dependencies step.');
    } else {
      logger.start('Installing dependencies...');

      try {
        await installDependencies({
          cwd: template.dir,
          packageManager: {
            name: selectedPackageManager,
            command: selectedPackageManager,
          },
        });
      } catch (error) {
        if (process.env.DEBUG) {
          throw error;
        }
        logger.error((error as Error).toString());
        process.exit(1);
      }

      logger.success('Installation completed.');
    }

    let gitInit = this.gitInit;
    if (gitInit === undefined) {
      gitInit = await logger
        .prompt('Initialize git repository?', {
          type: 'confirm',
          cancel: 'reject',
        })
        .catch(() => process.exit(1));
    }

    if (gitInit) {
      logger.info('Initializing git repository...\n');
      try {
        await x('git', ['init', template.dir], {
          throwOnError: true,
          nodeOptions: { stdio: 'inherit' },
        });
      } catch (error) {
        logger.warn(`Failed to initialize git repository: ${error}`);
      }
    }

    logger.log('\n✨ Vercube project has been created! Next steps:');
    const relativeTemplateDir = relative(process.cwd(), template.dir) || '.';
    const runCmd = selectedPackageManager === 'deno' ? 'task' : 'run';
    const nextSteps = [
      !this.shell && relativeTemplateDir.length > 1 && `\`cd ${relativeTemplateDir}\``,
      `Start development server with \`${selectedPackageManager} ${runCmd} dev\``,
    ].filter(Boolean);

    for (const step of nextSteps) {
      logger.log(` › ${step}`);
    }

    if (this.shell) {
      startShell(template.dir);
    }
  }
}
