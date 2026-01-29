import { build, createVercube } from '@vercube/devkit';
import { defineCommand } from 'citty';
import { cliFetch } from 'srvx/cli';
import type { CommandDef } from 'citty';

interface FetchOptions {
  entry?: string;
  url?: string;
  method?: string;
  headers?: string[];
  data?: string;
  verbose?: boolean;
}

export const fetchCommand: CommandDef = defineCommand({
  meta: {
    name: 'fetch',
    description: 'Fetch a request from the application',
  },
  args: {
    url: {
      type: 'positional',
      description: 'URL to fetch',
      default: '/',
    },
    entry: {
      type: 'string',
      description: 'Entry point for the application',
      default: 'index.mjs',
    },
    method: {
      type: 'string',
      description: 'HTTP method (default: GET, or POST if body is provided)',
      default: 'GET',
      alias: 'X',
      valueHint: 'GET, POST, PUT, DELETE, PATCH, HEAD, OPTIONS',
    },
    headers: {
      type: 'string',
      description: 'Add header (format: "Name: Value, Name: Value, ...")',
      alias: 'H',
      default: '',
    },
    data: {
      type: 'string',
      description: 'Request body (use @- for stdin, @file for file)',
      alias: 'd',
      default: '',
    },
    verbose: {
      type: 'boolean',
      description: 'Show request and response headers',
      alias: 'v',
      default: false,
    },
  },
  async run(ctx) {
    const app = await createVercube({ build: { dts: false } });

    // build app before running the command
    await build(app);

    await cliFetch({
      verbose: ctx.args.verbose,
      dir: app.config.build?.output?.dir ?? 'dist',
      entry: ctx.args.entry ?? 'index.mjs',
      url: ctx.args.url,
      method: ctx.args.method,
      headers: ctx.args.headers?.split(',') ?? [],
      data: ctx.args.data === '' ? undefined : ctx.args.data,
    });
  },
}) as CommandDef;
