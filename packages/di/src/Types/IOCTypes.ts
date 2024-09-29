/* eslint-disable @typescript-eslint/no-namespace */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { Container } from '../Domain/Container';

/**
 * This module exports various types used in IOC system.
 */

export namespace IOC {

  /**
   * This is a key that we use to identify service. Symbol is new way of doing it, however we
   * also keep standard/abstract classes for backward compatability.
   */
  export type ServiceKey<T = unknown> = symbol | Newable<T> | Abstract<T>;

  /**
   * This type holds implementation that might be used in class.
   */
  export type ServiceValue<T = unknown> = Newable<T> | T;

  /**
   * This interface holds information about service in IOC container.
   */
  export interface ServiceDef<T = unknown> {
    serviceKey: ServiceKey<T>;
    serviceValue: ServiceValue<T>;
    type: ServiceFactoryType;
  }

  /**
   * This holds type of bind we have used.
   */
  export enum ServiceFactoryType {
    CLASS = 'CLASS',
    CLASS_SINGLETON = 'CLASS_SINGLETON',
    INSTANCE = 'INSTANCE',
  }

  /**
   * Standard class.
   */
  export interface Newable<T> {
    new (...args: unknown[]): T;
  }

  /**
   * Abstract class.
   */
  export interface Abstract<T> {
    prototype: T;
  }

  /**
   * Service instance
   */
  export type Instance = any;

  /**
   * Helper type for "some prototype".
   */
  export type Prototype = any;

  /**
   * Container provider function.
   */
  export type ProviderFunc = (container: Container) => void;

  /**
   * Container constructor parameters
   */
  export interface ContainerParams {
    createLocked: boolean;
    injectMethod?: IOC.InjectMethod;
  }

  /**
   * Method for injecting dependencies.
   * Lazy - means dependency is resolved at the time when property is **accessed**, while
   * Static - means dependency is resolved as soon as class is instantiated
   */
  export enum InjectMethod {
    LAZY = 'LAZY',
    STATIC = 'STATIC',
  }

  /**
   * This type represents unique service identity. For now, its symbol, but we leave
   * gate open in case we would want to replace it.
   */
  export type Identity = symbol;

  /**
   * Service map used in application configs.
   */
  export interface ServiceMap {
    [key: string]: ServiceMapEntry;
  }

  /**
   * Service map handler function (requirement for async to work, see SPT-5448)
   */
  export type ServiceMapEntry = () => ServiceMapTask | ServiceMapTask[];

  /**
   * Expander asynchronous task.
   */
  export type ServiceMapTask = Promise<{ default: IOC.ProviderFunc }>;

  /**
   * IOC dependency stack, used for debuggging
   */
  export type Stack = (ServiceKey | Instance)[];

  /**
   * Type of dependency - either standard or optional.
   */
  export enum DependencyType {
    STANDARD,
    OPTIONAL,
  }

}
