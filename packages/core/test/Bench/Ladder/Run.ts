/**
 * Runs the benchmark ladder on real sockets and prints a table per runtime.
 *
 *   pnpm bench:ladder
 *   pnpm bench:ladder --runtime bun --rungs plain,body,404
 *   pnpm bench:ladder --target before=packages/core/tmp/before/index.mjs --target after=packages/core/dist/index.mjs
 *   pnpm bench:ladder compare before.json after.json
 *
 * With several targets every rung is measured on each of them in turn, run
 * after run, so a drift of the machine hits all targets alike. The first
 * target is the baseline of the comparison.
 *
 * Needs `bombardier` on the PATH and built packages (`pnpm build`).
 */
import { execFileSync, spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { connect } from 'node:net';
import { dirname, resolve } from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import type { Rung } from './Ladder';
import type { ChildProcess } from 'node:child_process';

type Runtime = 'node' | 'bun' | 'deno';

interface Measurement {
  /** Median requests per second over the runs. */
  rps: number;
  runs: number[];
}

interface Results {
  meta: {
    date: string;
    commit: string;
    duration: number;
    connections: number;
    runs: number;
    platform: string;
    versions: Record<string, string>;
  };
  targets: Record<string, Partial<Record<Runtime, Record<string, Measurement>>>>;
}

interface Target {
  label: string;
  core: string;
}

interface Server {
  target: Target;
  variant: string;
  port: number;
  child: ChildProcess;
}

const HOST = '127.0.0.1';
const BASE_PORT = 3200;
const here = import.meta.dirname;
const root = resolve(here, '../../../../..');

const COMMANDS: Record<Runtime, string[]> = {
  node: ['node'],
  bun: ['bun'],
  deno: ['deno', 'run', '-A'],
};

/**
 * Runs a command and returns its trimmed output, or an empty string when it fails.
 *
 * @param {string} command - The executable
 * @param {string[]} args - Its arguments
 * @returns {string} The output
 */
function output(command: string, args: string[]): string {
  try {
    return execFileSync(command, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    return '';
  }
}

/**
 * Whether something accepts connections on a port.
 *
 * @param {number} port - The port
 * @returns {Promise<boolean>} True when a connection was accepted
 */
function isListening(port: number): Promise<boolean> {
  return new Promise((done) => {
    const socket = connect({ host: HOST, port });

    socket.once('connect', () => {
      socket.destroy();
      done(true);
    });
    socket.once('error', () => done(false));
  });
}

/**
 * Waits until a port reaches the wanted state.
 *
 * @param {number} port - The port
 * @param {boolean} listening - The state to wait for
 * @returns {Promise<void>} Resolves once the port is in that state
 * @throws {Error} When it does not get there in ten seconds
 */
async function waitForPort(port: number, listening: boolean): Promise<void> {
  for (let attempt = 0; attempt < 200; attempt++) {
    if ((await isListening(port)) === listening) {
      return;
    }

    await new Promise((done) => setTimeout(done, 50));
  }

  throw new Error(`Port ${port} did not become ${listening ? 'ready' : 'free'}`);
}

/**
 * Starts the ladder application and waits until it listens.
 *
 * Two processes sharing a port is the classic way to measure nonsense, so the
 * port has to be free before and held by exactly one process after.
 *
 * @param {Runtime} runtime - The runtime to start it under
 * @param {Target} target - The build to measure
 * @param {string} variant - The application variant
 * @param {number} port - The port to listen on
 * @returns {Promise<Server>} The running server
 */
async function startServer(runtime: Runtime, target: Target, variant: string, port: number): Promise<Server> {
  if (await isListening(port)) {
    throw new Error(`Port ${port} is already in use`);
  }

  const [command, ...args] = COMMANDS[runtime];
  const child = spawn(command, [...args, resolve(here, 'Server.ts')], {
    cwd: root,
    // stdout goes nowhere: the default variant writes a line per request
    stdio: ['ignore', 'ignore', 'inherit'],
    env: {
      ...process.env,
      NODE_ENV: 'production',
      BENCH_CORE: target.core,
      BENCH_VARIANT: variant,
      BENCH_PORT: String(port),
    },
  });

  await waitForPort(port, true);

  const pids = output('lsof', ['-nP', `-iTCP:${port}`, '-sTCP:LISTEN', '-t'])
    .split('\n')
    .filter(Boolean);

  if (pids.length > 1) {
    child.kill('SIGKILL');
    throw new Error(`Port ${port} is held by ${pids.length} processes`);
  }

  return { target, variant, port, child };
}

/**
 * Stops a server and waits until its port is free again.
 *
 * @param {Server} server - The server to stop
 * @returns {Promise<void>} Resolves once the port is free
 */
async function stopServer(server: Server): Promise<void> {
  server.child.kill('SIGKILL');
  await waitForPort(server.port, false);
}

/**
 * Checks that a rung answers with the status it is supposed to, so a broken
 * route is not reported as a fast one.
 *
 * @param {Server} server - The server to ask
 * @param {Rung} rung - The rung
 * @returns {Promise<void>} Resolves when the status matches
 * @throws {Error} When it does not
 */
async function assertRung(server: Server, rung: Rung): Promise<void> {
  const response = await fetch(`http://${HOST}:${server.port}${rung.path}`, {
    method: rung.method,
    // no keep-alive: a pooled connection the server closed while idle would fail the next check
    headers: { ...rung.headers, connection: 'close' },
    body: rung.body,
    redirect: 'manual',
  });

  await response.arrayBuffer();

  if (response.status !== rung.status) {
    throw new Error(`${rung.id} on ${server.target.label}: expected ${rung.status}, got ${response.status}`);
  }
}

/**
 * Puts a rung under load and returns the mean requests per second.
 *
 * @param {Server} server - The server to load
 * @param {Rung} rung - The rung
 * @param {number} duration - Seconds to run for
 * @param {number} connections - Concurrent connections
 * @returns {number} Requests per second
 */
function load(server: Server, rung: Rung, duration: number, connections: number): number {
  const args = ['-c', String(connections), '-d', `${duration}s`, '--fasthttp', '-p', 'r', '-o', 'json', '-m', rung.method];

  for (const [name, value] of Object.entries(rung.headers ?? {})) {
    args.push('-H', `${name}: ${value}`);
  }

  if (rung.body !== undefined) {
    args.push('-b', rung.body);
  }

  args.push(`http://${HOST}:${server.port}${rung.path}`);

  const { result } = JSON.parse(execFileSync('bombardier', args, { encoding: 'utf8' }));
  const expected = result[`req${Math.floor(rung.status / 100)}xx`];
  const total = result.req1xx + result.req2xx + result.req3xx + result.req4xx + result.req5xx + result.others;

  if (expected !== total) {
    throw new Error(`${rung.id} on ${server.target.label}: ${total - expected} of ${total} responses had the wrong status`);
  }

  return result.rps.mean;
}

/**
 * The median of a list of numbers.
 *
 * @param {number[]} values - The numbers
 * @returns {number} Their median
 */
function median(values: number[]): number {
  const sorted = values.toSorted((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);

  return sorted.length % 2 === 0 ? (sorted[middle - 1] + sorted[middle]) / 2 : sorted[middle];
}

/**
 * Formats requests per second the way the tables show them.
 *
 * @param {number} rps - Requests per second
 * @returns {string} For example `123.4k`
 */
function formatRps(rps: number): string {
  return `${(rps / 1000).toFixed(1)}k`;
}

/**
 * Renders the results as one markdown table per runtime. With more than one
 * target, each one after the first gets a column with its change against the
 * first.
 *
 * @param {Results} results - The results to render
 * @param {Rung[]} rungs - The rungs, for their order and titles
 * @returns {string} The tables
 */
function render(results: Results, rungs: readonly Rung[]): string {
  const labels = Object.keys(results.targets);
  const [baseline, ...others] = labels;
  const runtimes = [...new Set(labels.flatMap((label) => Object.keys(results.targets[label])))] as Runtime[];
  const lines: string[] = [];

  for (const runtime of runtimes) {
    const version = results.meta.versions[runtime] ?? '';

    lines.push(`**${runtime} ${version}**`.trim(), '');
    lines.push(`| Rung | ${labels.map((label) => `${label} req/s`).join(' | ')} |${others.map(() => ' Change |').join('')}`);
    lines.push(`| --- | ${labels.map(() => '---:').join(' | ')} |${others.map(() => ' ---: |').join('')}`);

    for (const rung of rungs) {
      const base = results.targets[baseline][runtime]?.[rung.id];

      if (!base) {
        continue;
      }

      const cells = labels.map((label) => {
        const measured = results.targets[label][runtime]?.[rung.id];

        return measured ? formatRps(measured.rps) : '';
      });

      const changes = others.map((label) => {
        const measured = results.targets[label][runtime]?.[rung.id];

        if (!measured) {
          return '';
        }

        const change = (measured.rps / base.rps - 1) * 100;

        return `${change >= 0 ? '+' : ''}${change.toFixed(1)}%`;
      });

      lines.push(`| ${rung.title} | ${cells.join(' | ')} |${changes.map((change) => ` ${change} |`).join('')}`);
    }

    lines.push('');
  }

  const { duration, connections, runs, platform } = results.meta;

  lines.push(`\`bombardier -c ${connections} -d ${duration}s\`, median of ${runs}, one process, ${platform}.`);

  return lines.join('\n');
}

/**
 * Merges result files into one, target by target.
 *
 * @param {string[]} files - Paths of result files, the baseline first
 * @returns {Results} The merged results
 */
function merge(files: string[]): Results {
  const loaded = files.map((file) => JSON.parse(readFileSync(file, 'utf8')) as Results);
  const merged: Results = { meta: loaded[0].meta, targets: {} };

  for (const [index, results] of loaded.entries()) {
    for (const [label, target] of Object.entries(results.targets)) {
      // two files measured under the same label are still two targets
      merged.targets[label in merged.targets ? `${label} (${index + 1})` : label] = target;
    }
  }

  return merged;
}

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    runtime: { type: 'string', default: 'bun,node' },
    rungs: { type: 'string' },
    target: { type: 'string', multiple: true },
    duration: { type: 'string', default: '4' },
    connections: { type: 'string', default: '100' },
    runs: { type: 'string', default: '3' },
    out: { type: 'string' },
  },
});

const { RUNGS } = (await import(pathToFileURL(resolve(here, 'Ladder.ts')).href)) as { RUNGS: readonly Rung[] };

/**
 * Measures the selected rungs on every target and prints the tables.
 *
 * @returns {Promise<void>} Resolves once every runtime was measured
 */
async function run(): Promise<void> {
  const runtimes = values.runtime.split(',') as Runtime[];
  const selected = values.rungs ? values.rungs.split(',') : undefined;
  const rungs = RUNGS.filter((rung) => !selected || selected.includes(rung.id));
  const duration = Number(values.duration);
  const connections = Number(values.connections);
  const runs = Number(values.runs);

  const targets: Target[] = (values.target ?? ['current=packages/core/dist/index.mjs']).map((entry) => {
    const separator = entry.indexOf('=');

    return { label: entry.slice(0, separator), core: resolve(root, entry.slice(separator + 1)) };
  });

  for (const target of targets) {
    if (!existsSync(target.core)) {
      throw new Error(`${target.core} does not exist, run \`pnpm build\` first`);
    }
  }

  if (selected && rungs.length !== selected.length) {
    throw new Error(`Unknown rung, known ones are: ${RUNGS.map((rung) => rung.id).join(', ')}`);
  }

  const results: Results = {
    meta: {
      date: new Date().toISOString(),
      commit: output('git', ['rev-parse', '--short', 'HEAD']),
      duration,
      connections,
      runs,
      platform: `${process.platform} ${process.arch}`,
      versions: {
        node: output('node', ['--version']).replace(/^v/, ''),
        bun: output('bun', ['--version']),
        deno: output('deno', ['--version'])
          .split('\n')[0]
          .replace(/^deno /, '')
          .split(' ')[0],
      },
    },
    targets: Object.fromEntries(targets.map((target) => [target.label, {}])),
  };

  const variants = [...new Set(rungs.map((rung) => rung.variant))];
  const servers: Server[] = [];

  process.on('exit', () => {
    for (const server of servers) {
      server.child.kill('SIGKILL');
    }
  });

  for (const runtime of runtimes) {
    let port = BASE_PORT;

    for (const target of targets) {
      for (const variant of variants) {
        servers.push(await startServer(runtime, target, variant, port++));
      }

      results.targets[target.label][runtime] = {};
    }

    for (const rung of rungs) {
      const serving = servers.filter((server) => server.variant === rung.variant);
      const measured = new Map<Server, number[]>(serving.map((server) => [server, []]));

      for (const server of serving) {
        await assertRung(server, rung);
        load(server, rung, 1, connections);
      }

      for (let run = 0; run < runs; run++) {
        for (const server of serving) {
          measured.get(server)!.push(load(server, rung, duration, connections));
        }
      }

      for (const server of serving) {
        const samples = measured.get(server)!;

        results.targets[server.target.label][runtime]![rung.id] = { rps: median(samples), runs: samples };
      }

      const summary = serving.map((server) => `${server.target.label} ${formatRps(median(measured.get(server)!))}`).join(', ');

      console.error(`${runtime} ${rung.id}: ${summary}`);
    }

    while (servers.length > 0) {
      await stopServer(servers.pop()!);
    }
  }

  if (values.out) {
    mkdirSync(dirname(resolve(values.out)), { recursive: true });
    writeFileSync(resolve(values.out), `${JSON.stringify(results, undefined, 2)}\n`);
  }

  console.log(render(results, RUNGS));
}

if (positionals[0] === 'compare') {
  console.log(render(merge(positionals.slice(1)), RUNGS));
} else {
  await run();
}
