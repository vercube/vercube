import type { IOC } from '../Types/IOCTypes';
import type { Container } from './Container';

/**
 * Global property name for the IOC observer registry.
 */
export const IOC_DEVTOOLS_HOOK_KEY = '__VERCUBE_DEVTOOLS_HOOK__';

/**
 * A single service resolution record emitted when the container constructs an instance.
 */
export interface IOCResolveRecord {
  /** Service key that was resolved. */
  key: IOC.ServiceKey;
  /** Human readable name of the service key. */
  name: string;
  /** Factory type used to build the instance. */
  type: IOC.ServiceFactoryType;
  /** Context of the container that performed the resolution. */
  context: string | undefined;
  /** Timestamp (ms) before construction. */
  start: number;
  /** Timestamp (ms) after construction and injection. */
  end: number;
}

/**
 * Optional hook for observing the IOC container.
 */
export interface IOCDevtoolsHook {
  /** Called once for every {@link Container} instance after construction. */
  onContainerCreated?: (container: Container) => void;
  /** Called whenever the container constructs a new service instance. */
  onResolved?: (record: IOCResolveRecord) => void;
}

/**
 * Fan-out over every installed observer.
 *
 * The container has to be observable *before* `createApp` builds it, so the
 * registry lives on `globalThis` rather than in the container. It is a list
 * rather than a single slot because more than one package wants to watch:
 * telemetry turns construction into spans while devtools profiles bootstrap,
 * and whichever installed second used to silently evict the first.
 */
interface IOCObserverRegistry extends IOCDevtoolsHook {
  /** Installed observers, in installation order. */
  observers: IOCDevtoolsHook[];
}

/* oxlint-disable-next-line no-shadow-restricted-names */
declare const globalThis: {
  [IOC_DEVTOOLS_HOOK_KEY]?: IOCObserverRegistry;
};

/**
 * Returns the global registry, creating it on first use.
 *
 * @returns The registry
 */
function registry(): IOCObserverRegistry {
  let current = globalThis[IOC_DEVTOOLS_HOOK_KEY];

  if (!current) {
    const observers: IOCDevtoolsHook[] = [];

    current = {
      observers,
      onContainerCreated(container: Container): void {
        for (const observer of observers) {
          observer.onContainerCreated?.(container);
        }
      },
      onResolved(record: IOCResolveRecord): void {
        for (const observer of observers) {
          observer.onResolved?.(record);
        }
      },
    };

    globalThis[IOC_DEVTOOLS_HOOK_KEY] = current;
  }

  return current;
}

/**
 * Installs an observer.
 *
 * @param hook - The observer to install
 * @returns A function that removes it again
 */
export function addIOCDevtoolsHook(hook: IOCDevtoolsHook): () => void {
  const observers = registry().observers;
  observers.push(hook);

  return () => {
    const index = observers.indexOf(hook);

    if (index !== -1) {
      observers.splice(index, 1);
    }
  };
}

/**
 * Replaces every installed observer with `hook`, or removes them all.
 *
 * @param hook - The observer to install, or `undefined` to uninstall everything
 * @deprecated Use {@link addIOCDevtoolsHook}, which does not evict other observers.
 */
export function setIOCDevtoolsHook(hook: IOCDevtoolsHook | undefined): void {
  const current = registry();
  current.observers.length = 0;

  if (hook) {
    current.observers.push(hook);
  }
}

/**
 * Returns the fan-out hook the container calls into.
 *
 * @returns The registry, or undefined when no observer is installed
 */
export function getIOCDevtoolsHook(): IOCDevtoolsHook | undefined {
  const current = globalThis[IOC_DEVTOOLS_HOOK_KEY];

  return current && current.observers.length > 0 ? current : undefined;
}
