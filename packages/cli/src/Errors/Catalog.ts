import { defineErrorCatalog } from '@vercube/di';
import { RecipeError } from '../Recipes/RecipeError';
import { StaticExportError } from '../Static/StaticExportError';

/** Builds the `StaticExportError` the static export threw before it had codes. */
const staticExportError = (message: string): StaticExportError => new StaticExportError(message);

/**
 * The errors of the CLI: `vercube init`, `vercube add`, the recipes behind
 * them, the command registry and the static export of `vercube build`. The
 * recipe errors are a `RecipeError`, which the commands print without a stack
 * trace, and the ones of the static export a `StaticExportError`.
 */
export const CliErrors = defineErrorCatalog(
  'VERCUBE_CLI',
  {
    COMMAND_DECORATOR_MISSING: {
      message: ({ name }: { name: string }) => `[CommandRegistry] Class "${name}" is missing the @Command decorator.`,
      why: 'A class was registered as a CLI command, but it carries no command metadata. The name and description of a command come from the `@Command()` decorator on its class.',
      fix: "Decorate the class: `@Command({ name: 'seed', description: 'Seed the database' })`, with `Command` imported from `@vercube/cli/toolkit`.",
      // bare-error: the registry threw a plain Error before the catalog, and callers may catch it as one
      create: (message) => new Error(message),
    },
    ARGUMENTS_INVALID: {
      message: ({ problem }: { problem: string }) => problem,
      why: '`vercube init` was given a flag it does not have, or more than one positional argument. It takes one directory and refuses the rest, so a typo does not silently fall back to a default.',
      fix: 'Run `vercube init --help` for the flags, and pass a single directory: `vercube init my-app`.',
    },
    DIRECTORY_NOT_EMPTY: {
      message: ({ dir }: { dir: string }) => `${dir} is not empty. Pass --force to replace its contents.`,
      why: 'The directory the project would be created in already holds files. Nothing in it is replaced unless that was asked for, with `--force` or by answering the question in a terminal.',
      fix: 'Pick an empty directory, or pass `--force` to `vercube init` to replace what is there. The `.git` directory is kept.',
    },
    INIT_ABORTED: {
      message: 'Aborted.',
      why: 'The target directory is not empty and the question whether to replace its contents was answered with no.',
      fix: 'Run `vercube init` with another directory, or pass `--force` to replace the contents without being asked.',
    },
    UNKNOWN_TEMPLATE: {
      message: ({ template, available }: { template: string; available: string }) =>
        `Unknown template "${template}". Available: ${available}.`,
      why: 'The value of `--template` is not one of the templates this version of the CLI ships.',
      fix: 'Pass one of the templates listed in the message, for example `vercube init my-app --template api`.',
    },
    UNKNOWN_MODULE: {
      message: ({ unknown, available, many }: { unknown: string; available: string; many?: boolean }) =>
        `Unknown module${many ? 's' : ''}: ${unknown}. Available: ${available}.`,
      why: 'A module that was asked for is not among the recipes that were offered. The id is misspelled, or it belongs to a newer version of the CLI.',
      fix: 'Use the ids listed in the message, for example `vercube add queue` or `vercube init my-app --modules schema,testing`.',
    },
    UNKNOWN_DEPLOY_TARGET: {
      message: ({ deploy, available }: { deploy: string; available: string }) =>
        `Unknown deploy target "${deploy}". Available: ${available}.`,
      why: 'The value of `--deploy` is not one of the deploy targets this version of the CLI ships.',
      fix: 'Pass one of the targets listed in the message, for example `vercube init my-app --deploy node`.',
    },
    UNKNOWN_PACKAGE_MANAGER: {
      message: ({ packageManager, available }: { packageManager: string; available: string }) =>
        `Unknown package manager "${packageManager}". Available: ${available}.`,
      why: 'The value of `--packageManager` is not a package manager the CLI can install dependencies with.',
      fix: 'Pass one of the names listed in the message, for example `vercube init my-app --packageManager pnpm`.',
    },
    DENO_TEMPLATE_UNSUPPORTED: {
      message: ({ template }: { template: string }) => `Deno supports the api template only, got ${template}.`,
      why: 'The other templates are workspaces that are built with tools Deno does not run, so only the `api` template is offered for it.',
      fix: 'Use `--template api` together with `--packageManager deno`, or pick another package manager for this template.',
    },
    FLAG_VALUE_INVALID: {
      message: ({ flag, options, value }: { flag: string; options: string; value: string }) =>
        `--${flag} must be one of ${options}, got ${value}.`,
      why: 'A flag that answers a question of a module was given a value the module does not offer. A recipe only writes the setups it was tested with.',
      fix: 'Pass one of the values listed in the message, for example `vercube add queue --queue bullmq`.',
    },
    FLAG_VALUE_MISSING: {
      message: ({ flag }: { flag: string }) => `--${flag} needs a value.`,
      why: 'A flag that answers a question of a module was passed without a value, or was followed by another flag.',
      fix: 'Put the value after the flag, as in `--queue bullmq`, or drop the flag and pass `--yes` to take the default.',
    },
    FLAG_UNUSED: {
      message: ({ flags }: { flags: string }) =>
        `${flags} only applies to a module that is not selected. Add the module to --modules, or drop the flag.`,
      why: 'A flag that answers a question of a module was passed, but that module is not part of the project being created, so the answer would be ignored.',
      fix: 'Add the module to `--modules`, as in `--modules queue --queue bullmq`, or remove the flag.',
    },
    ANSWERS_MISSING: {
      message: ({ missing, example }: { missing: string; example?: string }) =>
        `Missing ${missing}. Pass them, or --yes for the defaults, when there is no terminal to ask in.${example ? ` Example: ${example}` : ''}`,
      why: 'The command runs without a terminal, in CI or with its input piped, so it cannot ask the questions the flags left open.',
      fix: 'Pass the flags named in the message, or `--yes` to take the default for each of them.',
    },
    NO_MODULES_NAMED: {
      message: ({ available }: { available: string }) =>
        `Name the modules to add, such as vercube add queue. Available: ${available}.`,
      why: '`vercube add` was run without a module, and it does not guess which one is meant.',
      fix: 'Name one or more modules, comma separated: `vercube add queue` or `vercube add schema,testing`.',
    },
    MODULE_NAME_INVALID: {
      message: ({ name }: { name: string }) => `Unknown module "${name}".`,
      why: 'The name is neither a built-in module nor a valid package name, so no recipe is looked up for it. A path such as `../recipe` is refused on purpose.',
      fix: 'Pass the id of a built-in module, as in `vercube add queue`, or the name of an installed package that ships a recipe, as in `vercube add @acme/vercube-search`.',
    },
    PACKAGE_NOT_INSTALLED: {
      message: ({ name }: { name: string }) =>
        `"${name}" is not a built-in module, and no package of that name is installed. Install it first, or pick a built-in module.`,
      why: 'A name that is not a built-in module is treated as a package that ships a recipe, and no such package was found in the `node_modules` of the project.',
      fix: 'Install the package and run the command again, for example `pnpm add @acme/vercube-search` and then `vercube add @acme/vercube-search`.',
    },
    PACKAGE_WITHOUT_RECIPE: {
      message: ({ name }: { name: string }) => `${name} does not export a recipe at ${name}/recipe.`,
      why: 'The package is installed, but its `package.json` has no `./recipe` entry in `exports`, which is where `vercube add` looks for a recipe.',
      fix: 'Add the module by hand as the package documents it. As the author of the package, add `"./recipe"` to `exports` in its `package.json`.',
    },
    RECIPE_EXPORT_INVALID: {
      message: ({ name }: { name: string }) => `${name}/recipe does not export a recipe made with defineRecipe().`,
      why: 'The `./recipe` entry of the package was imported, and neither its default export nor an export named `recipe` has an `apply` function.',
      fix: 'As the author of the package, export the recipe as the default: `export default defineRecipe({ ... })`, with `defineRecipe` imported from `@vercube/cli/recipe`.',
    },
    VERSION_MISMATCH: {
      message: ({ core, version }: { core: string; version: string }) =>
        `The project uses @vercube/core ${core}, this CLI is ${version}. Run the project's own CLI (\`npx vercube add\`), or upgrade every @vercube package to ${version} first.`,
      why: 'The project pins another version of `@vercube/core` than the CLI that is running. A recipe writes code for the version of the CLI, which may not exist in the version the project uses.',
      fix: 'Run the CLI installed in the project, `npx vercube add`, or bring every `@vercube/*` package of the project to the version of this CLI first.',
    },
    ALIAS_TARGET_UNSUPPORTED: {
      message: ({ target }: { target: string }) =>
        `tsconfig.json maps @/* to ${target}, the recipes write their files under src/. Map @/* to ./src/*, or add the module by hand.`,
      why: 'The files a recipe writes go under `src/` and import each other through `@/`. In this project `@/*` points somewhere else, so those imports would not resolve.',
      fix: 'Set `"paths": { "@/*": ["./src/*"] }` under `compilerOptions` in `tsconfig.json`, or add the module by hand.',
    },
    ALIAS_MISSING: {
      message:
        'The recipes import project files as @/..., which tsconfig.json does not map. Add "paths": { "@/*": ["./src/*"] } to its compilerOptions.',
      why: 'The files a recipe writes import each other through `@/`, and the `tsconfig.json` of the project has no `@/*` entry in `paths`, so those imports would not resolve.',
      fix: 'Add `"paths": { "@/*": ["./src/*"] }` to `compilerOptions` in `tsconfig.json`.',
    },
    PACKAGE_JSON_MISSING: {
      message: ({ root }: { root: string }) => `No package.json in ${root}. Run this in the root of a Vercube project.`,
      why: 'The directory the command works in has no `package.json`, so there is no project to add anything to.',
      fix: 'Run the command in the root of the project, or point at it: `vercube add queue --cwd path/to/project`.',
    },
    NOT_A_VERCUBE_PROJECT: {
      message: ({ file }: { file: string }) => `${file} does not depend on @vercube/core. Run this in a Vercube project.`,
      why: 'The `package.json` of the application lists `@vercube/core` neither in `dependencies` nor in `devDependencies`. A recipe must not wire Vercube into a package that is something else.',
      fix: 'Run the command in a Vercube project, or point at one with `--cwd`. Create a new project with `vercube init my-app`.',
    },
    PATH_OUTSIDE_APP: {
      message: ({ file }: { file: string }) => `${file} is outside the application.`,
      why: 'A recipe tried to write a file through a path that leaves the directory of the application. A recipe only changes files inside it.',
      fix: 'In the recipe, pass paths relative to the application without `..`, such as `src/services/Mailer.ts`.',
    },
    ENV_VALUE_MULTILINE: {
      message: ({ name }: { name: string }) => `The value of ${name} spans lines, which .env cannot hold.`,
      why: 'A recipe passed a value with a line break to `project.addEnv()`. In `.env` the second line would be read as another variable.',
      fix: 'In the recipe, pass a single line to `project.addEnv()`. Encode a value that needs line breaks, for example as base64.',
    },
    JSON_FILE_NOT_FOUND: {
      message: ({ file }: { file: string }) => `${file} not found.`,
      why: 'A recipe has to change a JSON file of the project, such as `package.json` or `tsconfig.json`, and the file does not exist.',
      fix: 'Create the file named in the message and run the command again.',
    },
    JSON_NOT_PLAIN: {
      message: ({ file }: { file: string }) => `${file} is not plain JSON (comments?), edit it yourself.`,
      why: 'A recipe has to change the file, and it could not be parsed as JSON. It usually holds comments or trailing commas, which rewriting the file would lose.',
      fix: 'Remove the comments and trailing commas from the file named in the message and run the command again, or make the change by hand.',
    },
    SOURCE_FILE_NOT_FOUND: {
      message: ({ file }: { file: string }) => `${file} not found. The recipe needs it to wire the module in.`,
      why: 'A recipe wires a module in by editing the files a Vercube template creates: `vercube.config.ts`, `src/boot/Container.ts` and `src/index.ts`. The one named in the message does not exist in this project.',
      fix: 'Create the file named in the message at that path, or add the module by hand as its documentation describes.',
    },
    SOURCE_FILE_UNPARSABLE: {
      message: ({ file, reason }: { file: string; reason: string }) => `${file} could not be parsed: ${reason}`,
      why: 'A recipe edits the file through its syntax tree, and the file has a syntax error, so it could not be read.',
      fix: 'Fix the syntax error reported in the message, then run the command again.',
    },
    CONFIG_EXPORT_UNSUPPORTED: {
      message: ({ file }: { file: string }) => `${file} must export its config as \`export default defineConfig({ ... })\`.`,
      why: 'A recipe adds its plugin to the object passed to `defineConfig()`. The default export of the config file is something else, such as a variable or the result of a function, which cannot be edited safely.',
      fix: 'Write the config as `export default defineConfig({ ... })` with an object literal in `vercube.config.ts`.',
    },
    PLUGINS_NOT_ARRAY: {
      message: ({ file, name, from }: { file: string; name: string; from: string }) =>
        `the \`plugins\` option of ${file} is not an array literal. Add ${name} from ${from} to it yourself.`,
      why: 'A recipe registers its plugin by adding it to the `plugins` array of `vercube.config.ts`. The option is built some other way there, such as a variable or a spread, which cannot be edited safely.',
      fix: 'Import the plugin named in the message and add it to `plugins` in `vercube.config.ts` by hand, or write the option as an array literal: `plugins: [QueuePlugin]`.',
    },
    CONTAINER_SETUP_NOT_FOUND: {
      message: ({ file, binding, code }: { file: string; binding?: string; code?: string }) =>
        `Could not find the container setup in ${file}: a function taking the container. ${
          binding ? `Bind ${binding} yourself with container.bind(${binding}).` : `Add this to it yourself: ${code}`
        }`,
      why: 'A recipe binds its services in `src/boot/Container.ts`, inside the function that receives the container. No such function was found in that file.',
      fix: 'Add what the message names to your container setup by hand, or export a setup function from `src/boot/Container.ts`: `export function useContainer(container: Container): void { ... }`.',
    },
    CREATE_APP_NOT_FOUND: {
      message: ({ file, code }: { file: string; code: string }) =>
        `Could not find the createApp() call in ${file}. Add this before it yourself: ${code}`,
      why: 'A recipe has to run code before the application is created, and `src/index.ts` has no top-level `createApp()` call to put it in front of.',
      fix: 'Add the code from the message to the entry file yourself, before the line that calls `createApp()`.',
    },
    DEFAULT_EXPORT_CONFLICT: {
      message: ({ file, code }: { file: string; code: string }) =>
        `${file} already has a default export. Replace it with this yourself: ${code}`,
      why: 'A deploy recipe has to make the handler of the platform the default export of `src/index.ts`, and the file already exports something else by default. Replacing an export the recipe did not write would lose it.',
      fix: 'Replace the `export default` in `src/index.ts` with the code from the message yourself.',
    },
    IMPORT_NAME_CONFLICT: {
      message: ({ name, existing, from }: { name: string; existing: string | undefined; from: string }) =>
        `${name} is already imported from ${existing}, not ${from}. Rename one of them and add it yourself.`,
      why: 'A recipe has to import a name the file already imports from another module. Reusing the name would bind or register the wrong class.',
      fix: 'Rename the existing import in that file, as in `import { Queue as MyQueue } from ...`, and run the command again.',
    },
    RECIPE_UNSUPPORTED: {
      message: ({ label, reason }: { label: string; reason: string }) => `${label} cannot be added to this project: ${reason}`,
      why: 'The `unsupported` check of the recipe refused this project, for example a module for a fullstack template in an API project. The reason in the message comes from the recipe.',
      fix: 'Follow the reason given in the message, or leave the module out of the command.',
    },
    RECIPE_FAILED: {
      message: ({ label, reason, unrestored }: { label: string; reason: string; unrestored?: string }) =>
        `${label}: ${reason}${unrestored ? ` These files could not be restored: ${unrestored}.` : ''}`,
      why: 'A recipe failed while it was applied. Every file the command had changed was put back, except the ones the message lists as not restored.',
      fix: 'Fix what the message reports after the name of the recipe and run the command again. Restore a file listed as not restored with `git checkout -- <file>`.',
    },
    RECIPE_ID_DUPLICATE: {
      message: ({ ids }: { ids: string }) => `Two recipes share the id ${ids}.`,
      why: 'Two recipes in the list given to `resolveRecipes()` or `applyRecipes()` have the same `id`, so it would not be clear which one a selection means.',
      fix: 'Give each recipe an `id` of its own in `defineRecipe({ id: ... })`.',
    },
    RECIPE_REQUIREMENT_MISSING: {
      message: ({ id }: { id: string }) => `A recipe requires "${id}", which does not exist.`,
      why: 'The `requires` of a recipe names an id that is not in the list of recipes it is resolved against.',
      fix: 'Correct the id in the `requires` of the recipe, or add the recipe it names to the list passed to `applyRecipes()`.',
    },
    RECIPE_CYCLE: {
      message: ({ path }: { path: string }) => `Recipes depend on each other in a cycle: ${path}.`,
      why: 'The `requires` and `after` of the recipes in the message point at each other, so there is no order to apply them in.',
      fix: 'Remove one of the `requires` or `after` entries along the path shown in the message.',
    },
    DEPLOY_TARGET_CONFLICT: {
      message: ({ deploys }: { deploys: string }) => `Pick one deploy target, got ${deploys}.`,
      why: 'More than one recipe of the kind `deploy` was selected, directly or through `requires`. A project is built for one target.',
      fix: 'Select a single deploy target, for example `vercube init my-app --deploy node`.',
    },
    BUILD_TARGET_UNKNOWN: {
      message: ({ target }: { target: string }) => `Unknown build target "${target}". Available: github-pages.`,
      why: 'The value of `--target` is not a target `vercube build` can export for. A build without `--target` only builds the application.',
      fix: 'Run `vercube build --target github-pages`, or leave `--target` out to build without a static export.',
      create: staticExportError,
    },
    STATIC_ENTRY_WITHOUT_FETCH: {
      message: ({ entry }: { entry: string }) =>
        `${entry} has no default export with a fetch handler. Add \`export default { fetch: app.fetch.bind(app) };\` to the entry.`,
      why: 'The static export imports the built entry and asks it for every route through the `fetch` of its default export. The entry exports none, so there is nothing to ask.',
      fix: 'Add `export default { fetch: app.fetch.bind(app) };` to the entry file of the application, then run `vercube build --target github-pages` again.',
      create: staticExportError,
    },
    STATIC_OUTPUT_OUTSIDE_PROJECT: {
      message: ({ directory }: { directory: string }) =>
        `The static export cannot be written to ${directory}: choose a directory of its own inside the project, such as dist-static.`,
      why: 'The export empties its output directory before it writes. The directory given with `--out` is the project itself or lies outside of it, so emptying it could delete files that are not the export.',
      fix: 'Pass a directory inside the project that holds nothing else, for example `vercube build --target github-pages --out dist-static`.',
      create: staticExportError,
    },
    STATIC_OUTPUT_OVERLAPS: {
      message: ({ directory, other }: { directory: string; other: string }) =>
        `The static export cannot be written to ${directory}: it would replace ${other}. Choose a directory of its own, such as dist-static.`,
      why: 'The export empties its output directory before it writes. The directory given with `--out` contains, or lies inside, a directory the project needs: `src`, `node_modules`, `.git`, the build output or a public directory.',
      fix: 'Pass a directory that holds nothing else, for example `vercube build --target github-pages --out dist-static`.',
      create: staticExportError,
    },
    STATIC_OUTPUT_NOT_EMPTY: {
      message: ({ directory }: { directory: string }) =>
        `${directory} is not empty and was not written by a static export. Remove it, or choose another directory with --out.`,
      why: 'The export empties its output directory before it writes, and only does so for a directory an earlier export marked as its own. This one has files and no such marker.',
      fix: 'Remove the directory, or pass another one with `--out`, for example `vercube build --target github-pages --out dist-static`.',
      create: staticExportError,
    },
  },
  { create: (message) => new RecipeError(message) },
);
