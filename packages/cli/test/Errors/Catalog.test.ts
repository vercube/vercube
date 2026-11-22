import { rmSync } from 'node:fs';
import { getErrorGuidance } from '@vercube/di';
import { afterEach, describe, expect, it } from 'vitest';
import { CliErrors } from '../../src/Errors/Catalog';
import { applyRecipes, defineRecipe } from '../../src/Recipes/Apply';
import { Project } from '../../src/Recipes/Project';
import { RecipeError } from '../../src/Recipes/RecipeError';
import { resolveRecipes } from '../../src/Recipes/Resolve';
import { resolveInitPlan } from '../../src/Scaffold/Plan';
import { getCommandMeta } from '../../src/Utils/CommandUtils';
import { apiTemplate } from '../Fixtures';
import type { RecipeTypes } from '../../src/Recipes/RecipeTypes';

const recipe = (id: string, extra: Partial<RecipeTypes.Recipe<any>> = {}): RecipeTypes.Recipe<any> =>
  defineRecipe({ id, label: id, apply: () => {}, ...extra });

function thrown(run: () => unknown): Error {
  try {
    run();
  } catch (error) {
    return error as Error;
  }

  throw new Error('nothing was thrown');
}

async function rejected(run: () => Promise<unknown>): Promise<Error> {
  try {
    await run();
  } catch (error) {
    return error as Error;
  }

  throw new Error('nothing was thrown');
}

describe('the errors of the CLI', () => {
  const directories: string[] = [];

  function template(overrides: Record<string, string | null> = {}): string {
    const dir = apiTemplate(overrides);

    directories.push(dir);

    return dir;
  }

  afterEach(() => {
    for (const dir of directories.splice(0)) {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('keeps RecipeError and its message for a recipe that cannot be resolved', () => {
    const error = thrown(() => resolveRecipes(['a'], [recipe('a', { requires: ['b'] }), recipe('b', { requires: ['a'] })]));

    expect(error).toBeInstanceOf(RecipeError);
    expect(error.name).toBe('RecipeError');
    expect(error.message).toBe('Recipes depend on each other in a cycle: a -> b -> a.');
    expect(getErrorGuidance(error)?.code).toBe('VERCUBE_CLI_RECIPE_CYCLE');
    expect(getErrorGuidance(error)?.link).toBe('https://vercube.dev/docs/core-features/errors#vercube_cli_recipe_cycle');
    // nothing the commands print or serialise changes
    expect(Object.keys(error)).toEqual(['name']);
  });

  it('describes a directory that is not a Vercube project', () => {
    const missing = thrown(() => new Project('/nowhere/at/all', { version: '1.0.0' }));

    expect(missing).toBeInstanceOf(RecipeError);
    expect(missing.message).toBe('No package.json in /nowhere/at/all. Run this in the root of a Vercube project.');
    expect(getErrorGuidance(missing)?.code).toBe('VERCUBE_CLI_PACKAGE_JSON_MISSING');

    const foreign = thrown(() => new Project(template({ 'package.json': '{ "name": "other" }' }), { version: '1.0.0' }));

    expect(foreign.message).toBe('package.json does not depend on @vercube/core. Run this in a Vercube project.');
    expect(getErrorGuidance(foreign)?.code).toBe('VERCUBE_CLI_NOT_A_VERCUBE_PROJECT');
  });

  it('describes a default export a deploy recipe must not replace', () => {
    const project = new Project(template({ 'src/index.ts': 'export default class Mine {}\n' }), { version: '1.0.0' });
    const error = thrown(() => project.setDefaultExport('export default handler;'));

    expect(error).toBeInstanceOf(RecipeError);
    expect(error.message).toBe(
      'src/index.ts already has a default export. Replace it with this yourself: export default handler;',
    );
    expect(getErrorGuidance(error)?.code).toBe('VERCUBE_CLI_DEFAULT_EXPORT_CONFLICT');
  });

  it('describes an unknown template of vercube init', async () => {
    const error = await rejected(() =>
      resolveInitPlan(
        { template: 'nope', flags: {}, yes: true, interactive: false },
        { templates: [{ id: 'api', label: 'API', registryName: 'vercube' }], recipes: [] } as any,
        {} as any,
      ),
    );

    expect(error).toBeInstanceOf(RecipeError);
    expect(error.message).toBe('Unknown template "nope". Available: api.');
    expect(getErrorGuidance(error)?.code).toBe('VERCUBE_CLI_UNKNOWN_TEMPLATE');
  });

  it('keeps the plain Error of the command registry', () => {
    class Bare {}

    const error = thrown(() => getCommandMeta(Bare));

    expect(error.constructor).toBe(Error);
    expect(error.message).toBe('[CommandRegistry] Class "Bare" is missing the @Command decorator.');
    expect(getErrorGuidance(error)?.code).toBe('VERCUBE_CLI_COMMAND_DECORATOR_MISSING');
  });

  it('keeps the code and fix of the error a recipe failed with', async () => {
    const project = new Project(template(), { version: '1.0.0' });
    const failing = recipe('mailer', {
      apply: (ctx: { project: Project }) => ctx.project.addEnv({ SMTP_KEY: 'a\nb' }),
    });
    const error = await rejected(() => applyRecipes(project, ['mailer'], [failing]));

    expect(error).toBeInstanceOf(RecipeError);
    expect(error.message).toBe('mailer: The value of SMTP_KEY spans lines, which .env cannot hold.');
    expect(getErrorGuidance(error)?.code).toBe('VERCUBE_CLI_ENV_VALUE_MULTILINE');
    expect(getErrorGuidance(error)?.fix).toBe(CliErrors.ENV_VALUE_MULTILINE.fix);
    expect((error.cause as Error).message).toBe('The value of SMTP_KEY spans lines, which .env cannot hold.');
  });

  it('describes a recipe that failed with an error of its own', async () => {
    const project = new Project(template(), { version: '1.0.0' });
    const failing = recipe('mailer', {
      apply: () => {
        throw new RecipeError('no SMTP host');
      },
    });
    const error = await rejected(() => applyRecipes(project, ['mailer'], [failing]));

    expect(error).toBeInstanceOf(RecipeError);
    expect(error.message).toBe('mailer: no SMTP host');
    expect(getErrorGuidance(error)?.code).toBe('VERCUBE_CLI_RECIPE_FAILED');
  });
});
