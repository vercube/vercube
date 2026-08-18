import type { IOC } from '../Types/IOCTypes';
import type { Container } from './Container';

/**
 * Global property name for the IOC devtools hook.
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

/* oxlint-disable-next-line no-shadow-restricted-names */
declare const globalThis: {
  [IOC_DEVTOOLS_HOOK_KEY]?: IOCDevtoolsHook;
};

let devtoolsHook: IOCDevtoolsHook | undefined = globalThis[IOC_DEVTOOLS_HOOK_KEY];

/**
 * Installs or replaces the devtools hook.
 * @param hook hook implementation, or `undefined` to uninstall
 */
export function setIOCDevtoolsHook(hook: IOCDevtoolsHook | undefined): void {
  devtoolsHook = hook;
  globalThis[IOC_DEVTOOLS_HOOK_KEY] = hook;
}

/**
 * Returns the currently installed devtools hook, if any.
 */
export function getIOCDevtoolsHook(): IOCDevtoolsHook | undefined {
  return devtoolsHook;
}
