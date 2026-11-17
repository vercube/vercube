import { WebsocketTypes } from '../Types/WebsocketTypes';
import type { WSPeer } from '../Types/WebsocketTypes';

/**
 * What a handler parameter decorator asks for.
 */
export interface HandlerArg {
  /** Index of the parameter. */
  idx: number;
  /** What to pass: the peer, the data, a namespace parameter or the peer context. */
  kind: 'peer' | 'data' | 'param' | 'context';
  /** Parameter or context key, for `param` and `context`. */
  name?: string;
}

/**
 * Turns the arguments the service passes a handler into the peer and the data.
 */
export interface HandlerArgSources {
  peer: WSPeer;
  data: unknown;
}

/**
 * Reads the namespace parameters of a peer.
 */
export type ParamsReader = (peer: WSPeer) => WebsocketTypes.NamespaceParams;

/** Per-class handler arguments and actions, kept apart from the HTTP metadata. */
interface HandlerArgsStore {
  args: Record<string, HandlerArg[]>;
  actions: Record<string, WebsocketTypes.HandlerAction>;
}

/** Marks a method already wrapped to resolve its arguments. */
const RESOLVING = Symbol('vercube:ws:resolving');

/** Stores by class prototype. */
const stores: WeakMap<object, HandlerArgsStore> = new WeakMap();

/**
 * Returns the store of a class prototype.
 *
 * @param {object} prototype - The class prototype
 * @returns {HandlerArgsStore} The store
 */
function getStore(prototype: object): HandlerArgsStore {
  let store = stores.get(prototype);

  if (!store) {
    store = { args: {}, actions: {} };
    stores.set(prototype, store);
  }

  return store;
}

/**
 * Records which lifecycle a handler serves, which decides the order of the
 * arguments the service calls it with.
 *
 * @param {object} prototype - The class prototype
 * @param {string} propertyName - The handler
 * @param {WebsocketTypes.HandlerAction} action - What the handler handles
 * @returns {void}
 */
export function setHandlerAction(prototype: object, propertyName: string, action: WebsocketTypes.HandlerAction): void {
  getStore(prototype).actions[propertyName] = action;
}

/**
 * Splits the arguments the service calls a handler with into the peer and the
 * data: `(data, peer)` for messages, `(peer)` on open and `(peer, details)` on
 * close and error.
 *
 * @param {WebsocketTypes.HandlerAction | undefined} action - What the handler handles
 * @param {unknown[]} args - The arguments
 * @returns {HandlerArgSources} The peer and the data
 */
function readSources(action: WebsocketTypes.HandlerAction | undefined, args: unknown[]): HandlerArgSources {
  switch (action) {
    case WebsocketTypes.HandlerAction.OPEN:
    case WebsocketTypes.HandlerAction.CLOSE:
    case WebsocketTypes.HandlerAction.ERROR: {
      return { peer: args[0] as WSPeer, data: args[1] };
    }
    default: {
      return { peer: args[1] as WSPeer, data: args[0] };
    }
  }
}

/**
 * Registers a handler parameter and makes the instance method resolve its
 * parameters when called.
 *
 * Parameter decorators are initialized before the method decorators of the
 * same method, so the wrapper sits innermost: `@Emit()` and friends still see
 * the `(data, peer)` call the service makes, and only the method itself gets
 * the resolved arguments. Parameters without a decorator keep what the
 * service passed at their position.
 *
 * @param {object} prototype - The class prototype
 * @param {Record<string, any>} instance - The class instance
 * @param {string} propertyName - The handler
 * @param {HandlerArg} arg - The parameter
 * @param {ParamsReader} readParams - Reads the namespace parameters of a peer
 * @returns {void}
 */
export function registerHandlerArg(
  prototype: object,
  instance: Record<string, any>,
  propertyName: string,
  arg: HandlerArg,
  readParams: ParamsReader,
): void {
  const store = getStore(prototype);
  const args = (store.args[propertyName] ??= []);
  const index = args.findIndex((entry) => entry.idx === arg.idx);

  if (index === -1) {
    args.push(arg);
  } else {
    args[index] = arg;
  }

  const original = instance[propertyName];

  if (typeof original !== 'function' || original[RESOLVING]) {
    return;
  }

  const wrapped = function (this: unknown, ...callArgs: unknown[]): unknown {
    const sources = readSources(store.actions[propertyName], callArgs);
    const resolved = [...callArgs];

    for (const entry of store.args[propertyName] ?? []) {
      resolved[entry.idx] = resolveArg(entry, sources, readParams);
    }

    return original.apply(instance, resolved);
  };

  Object.defineProperty(wrapped, RESOLVING, { value: true });
  instance[propertyName] = wrapped;
}

/**
 * Resolves one handler parameter.
 *
 * @param {HandlerArg} arg - The parameter
 * @param {HandlerArgSources} sources - The peer and the data of the call
 * @param {ParamsReader} readParams - Reads the namespace parameters of a peer
 * @returns {unknown} The value
 */
function resolveArg(arg: HandlerArg, sources: HandlerArgSources, readParams: ParamsReader): unknown {
  switch (arg.kind) {
    case 'peer': {
      return sources.peer;
    }
    case 'data': {
      return sources.data;
    }
    case 'param': {
      return sources.peer ? readParams(sources.peer)[arg.name!] : undefined;
    }
    case 'context': {
      const context = sources.peer?.context as Record<string, unknown> | undefined;
      return arg.name ? context?.[arg.name] : context;
    }
  }
}
