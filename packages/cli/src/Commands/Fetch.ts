import { build, createVercube } from '@vercube/devkit';
import { cliFetch } from 'srvx/cli';
import { BaseCommand } from '../BaseCommand';
import { Arg } from '../Decorators/Arg';
import { Command } from '../Decorators/Command';
import { Flag } from '../Decorators/Flag';

/**
 * Builds the app, then sends an HTTP request and prints the response.
 * Useful for quick endpoint testing without running a full server.
 *
 * @example
 * ```sh
 * vercube fetch /api/users
 * vercube fetch /api/users --method POST --data '{"name":"test"}'
 * vercube fetch /api/users --verbose
 * ```
 */
@Command({
  name: 'fetch',
  description: 'Fetch a request from the application',
})
export class FetchCommand extends BaseCommand {
  /** Target URL path, e.g. `/api/users`. */
  @Arg({ name: 'url', description: 'URL to fetch' })
  public url!: string;

  /** Entry file relative to the output directory. */
  @Flag({ name: 'entry', description: 'Entry point for the application', default: 'index.mjs' })
  public entry!: string;

  /** HTTP method. */
  @Flag({ name: 'method', description: 'HTTP method', default: 'GET' })
  public method!: string;

  /** Request headers as `"Name: Value, Name: Value"`. */
  @Flag({ name: 'headers', description: 'Add header (format: "Name: Value, ...")', type: 'string' })
  public headers!: string | undefined;

  /** Request body. `@-` reads from stdin, `@filename` reads from a file. */
  @Flag({ name: 'data', description: 'Request body (use @- for stdin, @file for file)', type: 'string' })
  public data!: string | undefined;

  /** Print request and response headers alongside the body. */
  @Flag({ name: 'verbose', description: 'Show request and response headers', default: false })
  public verbose!: boolean;

  /**
   * @returns resolves when the response has been printed
   */
  public override async run(): Promise<void> {
    const app = await createVercube({ build: { dts: false } });
    await build(app);

    await cliFetch({
      verbose: this.verbose,
      dir: app.config.build?.output?.dir ?? 'dist',
      entry: this.entry,
      url: this.url,
      method: this.method,
      header: this.headers?.split(',') ?? [],
      data: this.data,
    });
  }
}
