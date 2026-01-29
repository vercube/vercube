import { createReadStream } from 'node:fs';
import { Readable } from 'node:stream';
import { App } from '@vercube/core';
import { build, createVercube, getServerAppInstance } from '@vercube/devkit';
import { defineCommand } from 'citty';
import { bindMockContainer } from '../utils/container';
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
    description: 'Start development server',
  },
  args: {
    entry: {
      type: 'string',
      description: 'Entry point for the application',
      default: 'src/index.ts',
    },
    url: {
      type: 'positional',
      description: 'URL to fetch',
      default: '/',
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
      description: 'Add header (format: "Name: Value", can be used multiple times)',
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

    // load server app entry
    const serverApp = await getServerAppInstance(app);

    // override container with mock container
    serverApp.container.expand(bindMockContainer);

    const opts: FetchOptions = {
      ...ctx.args,
      headers: ctx.args.headers?.split(',') ?? [],
    };

    await handleFetch(serverApp, opts);
  },
}) as CommandDef;

async function handleFetch(app: App, opts: FetchOptions): Promise<void> {
  // Build request URL
  const url = new URL(opts.url || '/', `http://${app.config.server?.host || 'cli'}`).toString();

  // Build headers
  const headers = new Headers();
  if (opts.headers) {
    for (const header of opts.headers) {
      const colonIndex = header.indexOf(':');
      if (colonIndex > 0) {
        const name = header.slice(0, colonIndex).trim();
        const value = header.slice(colonIndex + 1).trim();
        headers.append(name, value);
      }
    }
  }

  // Build body
  let body: BodyInit | undefined;
  if (opts.data !== undefined && opts.data !== '') {
    if (opts.data === '@-') {
      // Read from stdin
      body = new ReadableStream({
        async start(controller) {
          for await (const chunk of process.stdin) {
            controller.enqueue(chunk);
          }
          controller.close();
        },
      });
    } else if (opts.data.startsWith('@')) {
      // Read from file as stream
      body = Readable.toWeb(createReadStream(opts.data.slice(1))) as unknown as ReadableStream;
    } else {
      body = opts.data;
    }
  }

  const method = opts.method || (body === undefined ? 'GET' : 'POST');

  // Build request
  const req = new Request(url, {
    method,
    headers,
    body,
  });

  // Verbose: print request info
  if (opts.verbose) {
    const parsedUrl = new URL(url);
    console.error(`> ${method} ${parsedUrl.pathname}${parsedUrl.search} HTTP/1.1`);
    console.error(`> Host: ${parsedUrl.host}`);
    for (const [name, value] of Object.entries(headers)) {
      console.error(`> ${name}: ${value}`);
    }
    console.error('>');
  }

  const res = await app.fetch(req);

  // Verbose: print response info
  if (opts.verbose) {
    console.error(`< HTTP/1.1 ${res.status} ${res.statusText}`);
    for (const [name, value] of Object.entries(res.headers)) {
      console.error(`< ${name}: ${value}`);
    }
    console.error('<');
  }

  // Stream response to stdout
  if (res.body) {
    const { isBinary, encoding } = getResponseFormat(res);

    if (isBinary) {
      // Stream binary directly to stdout
      // @ts-expect-error - TODO: fix this
      for await (const chunk of res.body as AsyncIterable<Uint8Array>) {
        process.stdout.write(chunk);
      }
    } else {
      // Stream text with proper encoding
      const decoder = new TextDecoder(encoding);
      // @ts-expect-error - TODO: fix this
      for await (const chunk of res.body as AsyncIterable<Uint8Array>) {
        process.stdout.write(decoder.decode(chunk, { stream: true }));
      }
      // Flush any remaining bytes
      const remaining = decoder.decode();
      if (remaining) {
        process.stdout.write(remaining);
      }
      // Add trailing newline for text content when interactive
      // (avoid changing byte-for-byte output in scripts/pipes)
      if (process.stdout.isTTY) {
        process.stdout.write('\n');
      }
    }
  }
}

function getResponseFormat(res: Response): {
  isBinary: boolean;
  encoding: string;
} {
  const contentType = res.headers.get('content-type') || '';
  const isBinary =
    contentType.startsWith('application/octet-stream') ||
    contentType.startsWith('image/') ||
    contentType.startsWith('audio/') ||
    contentType.startsWith('video/') ||
    contentType.startsWith('application/pdf') ||
    contentType.startsWith('application/zip') ||
    contentType.startsWith('application/gzip');
  const encoding = contentType.includes('charset=') ? contentType.split('charset=')[1].split(';')[0].trim() : 'utf8';
  return { isBinary, encoding };
}
