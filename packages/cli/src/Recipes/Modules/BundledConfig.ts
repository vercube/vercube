import type { Project } from '../Project';

/**
 * Makes the application carry its configuration in the bundle, for a deploy
 * target that has no `vercube.config.ts` to read at run time: the entry
 * imports the file and hands it to `createApp()` through `provideConfig()`.
 *
 * @param {Project} project - The application being changed
 * @returns {void}
 */
export function bundleConfig(project: Project): void {
  project.addToEntry('provideConfig(config);', {
    position: 'before-create-app',
    imports: { provideConfig: '@vercube/core', config: { from: '../vercube.config', default: true } },
  });

  // Importing the configuration puts it under the type check, and its default
  // export has no declared type. With no declarations to emit, the compiler
  // need not be able to write them file by file.
  project.updateJson('tsconfig.json', (tsconfig) => {
    const options = (tsconfig.compilerOptions ??= {});

    if (options.isolatedDeclarations === false && options.declaration === false) {
      return false;
    }

    options.isolatedDeclarations = false;
    options.declaration = false;

    return true;
  });

  const hadBuild = /\bbuild\s*:/.test(project.read('vercube.config.ts') ?? '');

  // what is deployed is a bundle, not a library: it needs no declarations
  project.setConfig('build', '{ dts: false }');

  if (hadBuild) {
    project.note('Add `dts: false` to the `build` option of vercube.config.ts: a deployed bundle needs no declarations');
  }
}
