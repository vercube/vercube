/* eslint-disable unicorn/no-process-exit */
import { defineCommand, type CommandDef } from 'citty';
import { consola, type ConsolaInstance } from 'consola';
import { colors } from 'consola/utils';
import { vercubeIcon } from '../utils/logo';
import { hasTTY } from 'std-env';
import { relative, resolve } from 'pathe';
import { existsSync } from 'node:fs';
import { downloadTemplate, startShell } from 'giget';
import { installDependencies, type PackageManagerName } from 'nypm';
import { x } from 'tinyexec';


export const logger: ConsolaInstance = consola.withTag(colors.whiteBright(colors.bold(colors.bgGreenBright(' vercube '))));
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

export const initCommand: CommandDef = defineCommand({
  meta: {
    name: 'init',
    description: 'Initialize a new Vercube app',
  },
  args: {
    dir: {
      type: 'positional',
      description: 'Project directory',
      default: '',
    },
    force: {
      type: 'boolean',
      alias: 'f',
      description: 'Override existing directory',
    },
    install: {
      type: 'boolean',
      default: true,
      description: 'Skip installing dependencies',
    },
    gitInit: {
      type: 'boolean',
      description: 'Initialize git repository',
      default: true,
    },
    packageManager: {
      type: 'string',
      description: 'Package manager choice (npm, pnpm, yarn, bun)',
      default: 'pnpm',
    },

  },
  async run(ctx) {

    if (hasTTY) {
      process.stdout.write(`\n${vercubeIcon}\n\n`);
    }

    consola.info(`Welcome to ${colors.bold('Vercube')}!`);

    if (ctx.args.dir === '') {
      ctx.args.dir = await logger.prompt('Where would you like to create your project?', {
        placeholder: './vercube-app',
        type: 'text',
        default: 'vercube-app',
        cancel: 'reject',
      }).catch(() => process.exit(1));
    }

    const cwd = resolve(process.cwd());
    let templateDownloadPath = resolve(cwd, ctx.args.dir);
    logger.info(`Creating a new project in ${colors.cyan(relative(cwd, templateDownloadPath) || templateDownloadPath)}.`);

    let shouldForce = Boolean(ctx.args.force);

    // Prompt the user if the template download directory already exists
    // when no `--force` flag is provided
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
          templateDownloadPath = resolve(cwd, await logger.prompt('Please specify a different directory:', {
            type: 'text',
            cancel: 'reject',
          }).catch(() => process.exit(1)));
          break;
        }

        // 'Abort' or Ctrl+C
        default: {
          process.exit(1);
        }
      }
    }

    // Download template
    let template: any;

    try {
      template = await downloadTemplate(DEFAULT_TEMPLATE_NAME, {
        dir: templateDownloadPath,
        force: shouldForce,
        offline: Boolean(ctx.args.offline),
        preferOffline: Boolean(ctx.args.preferOffline),
        registry: DEFAULT_REGISTRY,
      });
    } catch (error_) {
      if (process.env.DEBUG) {
        throw error_;
      }
      logger.error((error_ as Error).toString());
      process.exit(1);
    }

    // Resolve package manager
    const packageManagerArg = ctx.args.packageManager as PackageManagerName;
    const selectedPackageManager = packageManagerOptions.includes(packageManagerArg)
      ? packageManagerArg
      : await logger.prompt('Which package manager would you like to use?', {
        type: 'select',
        options: packageManagerOptions,
        cancel: 'reject',
      }).catch(() => process.exit(1));

    // Install project dependencies
    // or skip installation based on the '--no-install' flag
    if (ctx.args.install === false) {
      logger.info('Skipping install dependencies step.');
    }
    else {
      logger.start('Installing dependencies...');

      try {
        await installDependencies({
          cwd: template.dir,
          packageManager: {
            name: selectedPackageManager,
            command: selectedPackageManager,
          },
        });
      }
      catch (error_) {
        if (process.env.DEBUG) {
          throw error_;
        }
        logger.error((error_ as Error).toString());
        process.exit(1);
      }

      logger.success('Installation completed.');
    }

    if (ctx.args.gitInit === undefined) {
      ctx.args.gitInit = await logger.prompt('Initialize git repository?', {
        type: 'confirm',
        cancel: 'reject',
      }).catch(() => process.exit(1));
    }
    if (ctx.args.gitInit) {
      logger.info('Initializing git repository...\n');
      try {
        await x('git', ['init', template.dir], {
          throwOnError: true,
          nodeOptions: {
            stdio: 'inherit',
          },
        });
      }
      catch (error_) {
        logger.warn(`Failed to initialize git repository: ${error_}`);
      }
    }

    // Display next steps
    logger.log(
      '\n✨ Vercube project has been created! Next steps:',
    );
    const relativeTemplateDir = relative(process.cwd(), template.dir) || '.';
    const runCmd = selectedPackageManager === 'deno' ? 'task' : 'run';
    const nextSteps = [
      !ctx.args.shell
      && relativeTemplateDir.length > 1
      && `\`cd ${relativeTemplateDir}\``,
      `Start development server with \`${selectedPackageManager} ${runCmd} dev\``,
    ].filter(Boolean);

    for (const step of nextSteps) {
      logger.log(` › ${step}`);
    }

    if (ctx.args.shell) {
      startShell(template.dir);
    }

  },

});