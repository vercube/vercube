import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { build, builtEntry, createVercube, inspect, typegen } from '@vercube/devkit';
import consola from 'consola';
import { BaseCommand } from '../BaseCommand';
import { Command } from '../Decorators/Command';
import { Flag } from '../Decorators/Flag';
import { RecipeError } from '../Recipes/RecipeError';
import { exportStatic, formatStaticReport } from '../Static/Export';
import type { StaticRoute } from '../Static/Export';

/**
 * Builds the Vercube application for production.
 *
 * @example
 * ```sh
 * vercube build
 * vercube build --entry src/index.ts
 * vercube build --target github-pages --routes /posts/1,/posts/2
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

  /** `github-pages` also writes the application as static files, see {@link BuildCommand.exportStatic}. */
  @Flag({ name: 'target', description: 'Also export static files for a static host: github-pages', type: 'string' })
  public target!: string | undefined;

  /** Where the static files go. */
  @Flag({ name: 'out', description: 'Directory of the static export', default: 'dist-static' })
  public out!: string;

  /** Paths to render besides the routes that need no input, comma-separated. */
  @Flag({ name: 'routes', description: 'Extra paths to render for the static export (comma-separated)', type: 'string' })
  public routes!: string | undefined;

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

    if (this.target !== undefined) {
      if (this.target !== 'github-pages') {
        throw new RecipeError(`Unknown build target "${this.target}". Available: github-pages.`);
      }

      await this.exportStatic(app);
    }
  }

  /**
   * Writes the built application as static files for GitHub Pages: the public
   * directories, and the answer of every route that needs no input.
   *
   * The built entry is imported with `VERCUBE_LISTEN=0`, so it binds no port,
   * and asked through the `fetch` of its default export.
   *
   * @param {Awaited<ReturnType<typeof createVercube>>} app - The application that was just built
   * @returns {Promise<void>} Resolves once the files are written
   */
  private async exportStatic(app: Awaited<ReturnType<typeof createVercube>>): Promise<void> {
    const root = app.config.build?.root ?? process.cwd();
    const entry = resolve(root, app.config.build?.output?.dir ?? 'dist', builtEntry(app));
    const sections = await inspect(app, ['routes']);
    const routes = (sections.routes?.data ?? []) as StaticRoute[];

    process.env.VERCUBE_LISTEN = '0';

    const module = (await import(pathToFileURL(entry).href)) as { default?: { fetch?: (request: Request) => Promise<Response> } };
    const handler = module.default?.fetch;

    if (typeof handler !== 'function') {
      throw new RecipeError(
        `${entry} has no default export with a fetch handler. Add \`export default { fetch: app.fetch.bind(app) };\` to the entry.`,
      );
    }

    const report = await exportStatic({
      fetch: (request) => handler.call(module.default, request),
      routes,
      directory: resolve(root, this.out),
      publicDirs: (app.config.server?.static?.dirs ?? ['public']).map((dir) => resolve(root, dir)),
      paths: this.routes
        ? this.routes
            .split(',')
            .map((path) => path.trim())
            .filter(Boolean)
        : [],
      githubPages: true,
    });

    consola.success({
      tag: 'static',
      message: `Wrote ${report.written.length} route${report.written.length === 1 ? '' : 's'} and ${report.copied.length} public director${report.copied.length === 1 ? 'y' : 'ies'} to ${this.out}`,
    });

    for (const line of formatStaticReport(report)) {
      consola.log(line);
    }
  }
}
