import { createViteTransport } from 'env-runner/vite';
import { ESModulesEvaluator, ModuleRunner } from 'vite/module-runner';
import type { UpgradeContext } from 'env-runner';

/**
 * env-runner worker bootstrap for the Vercube Vite integration.
 *
 * Runs inside the isolated dev worker. For each Vite environment it owns a
 * {@link ViteEnvRunner} that imports the environment's entry module through a
 * Vite `ModuleRunner` and dispatches HTTP requests into the resulting `fetch`
 * handler. The host registers environments via the `vercube:vite-env` message,
 * and forwards WebSocket upgrades via {@link upgrade}.
 */

type NodeUpgradeHandler = (req: unknown, socket: unknown, head: unknown) => void | Promise<void>;

interface ViteEntry {
  fetch?: (req: Request) => Promise<Response> | Response;
  default?: { fetch?: (req: Request) => Promise<Response> | Response };
  handleUpgrade?: NodeUpgradeHandler;
}

interface IpcContext {
  sendMessage: (data: unknown) => void;
}

type MessageListener = (message: any) => void;

let sendMessage: ((data: unknown) => void) | undefined;
const messageListeners = new Set<MessageListener>();

const envs: Record<string, ViteEnvRunner | undefined> = Object.create(null);

/**
 * Owns the module runner and loaded entry for a single Vite environment.
 */
class ViteEnvRunner {
  public readonly name: string;
  public readonly runner: ModuleRunner;

  readonly #entryPath: string;
  #entry: ViteEntry | undefined;
  #entryError: unknown;

  constructor({ name, entry }: { name: string; entry: string }) {
    this.name = name;
    this.#entryPath = entry;

    const onMessage = (listener: MessageListener): void => void messageListeners.add(listener);
    const transport = createViteTransport((data: unknown) => sendMessage?.(data), onMessage, name);
    const debug = typeof process !== 'undefined' && process.env?.VERCUBE_DEBUG ? console.debug : undefined;

    this.runner = new ModuleRunner({ transport }, new ESModulesEvaluator(), debug);
    void this.reload();
  }

  /**
   * (Re)imports the entry module, capturing any load-time error to surface on fetch.
   */
  public async reload(): Promise<void> {
    try {
      this.#entry = (await this.runner.import(this.#entryPath)) as ViteEntry;
      this.#entryError = undefined;
    } catch (error) {
      console.error(error);
      this.#entryError = error;
    }
  }

  /**
   * Dispatches a request into the entry's `fetch` handler, waiting briefly for a
   * still-loading entry.
   */
  public async fetch(req: Request): Promise<Response> {
    for (let i = 0; i < 5 && !(this.#entry || this.#entryError); i++) {
      await new Promise((r) => setTimeout(r, 100 * 2 ** i));
    }
    if (this.#entryError) {
      return renderError(this.#entryError);
    }
    const handler = this.#entry?.fetch ?? this.#entry?.default?.fetch;
    if (!handler) {
      return renderError(new Error(`No fetch handler exported from ${this.#entryPath}`));
    }
    try {
      return await handler(req);
    } catch (error) {
      return renderError(error);
    }
  }

  /**
   * Hands a raw Node HTTP upgrade to the entry's `handleUpgrade`, if it exports
   * one (installed by `@vercube/ws`). No-op otherwise.
   */
  public async upgrade(context: UpgradeContext): Promise<void> {
    const node = (context as { node?: { req: unknown; socket: unknown; head: unknown } }).node;
    if (node && this.#entry?.handleUpgrade) {
      await this.#entry.handleUpgrade(node.req, node.socket, node.head);
    }
  }
}

/**
 * Reloads every registered environment's entry module.
 */
async function reloadAll(): Promise<void> {
  await Promise.all(Object.values(envs).map((env) => env?.reload()));
}

// Keep the worker alive on stray async errors instead of crashing the dev server.
if (typeof process !== 'undefined' && typeof process.on === 'function') {
  process.on('unhandledRejection', (error) => console.error(error));
  process.on('uncaughtException', (error) => console.error(error));
}

/**
 * env-runner AppEntry: routes an incoming request to the named environment
 * (defaulting to the Vercube server environment).
 */
export function fetch(req: Request): Promise<Response> {
  const name = req?.headers.get('x-vite-env') || 'vercube';
  const env = envs[name];
  if (!env) {
    return Promise.resolve(renderError(new Error(`Unknown vite environment "${name}"`)));
  }
  return env.fetch(req);
}

/**
 * env-runner AppEntry: forwards a WebSocket upgrade to the Vercube environment.
 */
export function upgrade(context: UpgradeContext): void {
  void envs['vercube']?.upgrade(context);
}

/**
 * env-runner IPC hooks: opens the message channel, registers environments, and
 * relays module-runner transport messages.
 */
export const ipc = {
  onOpen(ctx: IpcContext): void {
    sendMessage = ctx.sendMessage;
  },
  onMessage(message: any): void {
    if (message?.type === 'custom' && message.event === 'vercube:vite-env') {
      const { name, entry } = message.data as { name: string; entry: string };
      envs[name] ??= new ViteEnvRunner({ name, entry });
      return;
    }
    if (message?.type === 'full-reload') {
      void reloadAll();
      return;
    }
    for (const listener of messageListeners) {
      listener(message);
    }
  },
  onClose(): void {},
};

/**
 * Renders an error as a JSON HTTP 500 response.
 */
function renderError(error: unknown): Response {
  const err = error as { message?: string; stack?: string; status?: number };
  return new Response(
    JSON.stringify(
      { status: err?.status ?? 500, message: err?.message ?? String(error), stack: err?.stack?.split('\n').map((l) => l.trim()) },
      null,
      2,
    ),
    {
      status: err?.status ?? 500,
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
    },
  );
}
