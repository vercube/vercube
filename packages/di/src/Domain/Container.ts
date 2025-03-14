 import { IOC } from '../Types/IOCTypes';
import { ContainerEvents } from './ContainerEvents';
import { destroyDecorators, initializeDecorators, type IDecoratedInstance } from '../Utils/Utils';
import { IOCEngine } from './Engine';



/**
 * This is new implementation of IOC Container. It mimics Inversify.js container a little bit but its
 * simpler and (probably) more performant on larger scales.
 */
export class Container {

  // determines if container is locked or not; this is BC feature that should be removed in the future
  protected fLocked: boolean = false;

  // default IOC params
  protected fDefaultParams: IOC.ContainerParams = {
    createLocked: false,
  };

  // this is map of services, every .bind(), .bindXXX() is registered in this map
  protected fServices: Map<IOC.ServiceKey, IOC.ServiceDef> = new Map();

  // this is map of new services added to container, as a temporary lookup table
  protected fNewQueue: Map<IOC.ServiceKey, IOC.ServiceDef> = new Map();

  // holds all "singleton" type service instances
  protected fSingletonInstances: Map<IOC.ServiceKey, IOC.Instance> = new Map();

  // how deps should be injected here, default to "LAZY"
  protected fInjectMethod: IOC.InjectMethod = IOC.InjectMethod.STATIC;

  // container event handler
  protected fContainerEvents: ContainerEvents = new ContainerEvents();

  /**
   * Constructor for container.
   * @param params initial params for container
   */
  constructor(params?: Partial<IOC.ContainerParams>) {
    this.fLocked = params?.createLocked ?? false;
    this.fDefaultParams = Object.assign(this.fDefaultParams, params);
    this.fInjectMethod = params?.injectMethod ?? IOC.InjectMethod.STATIC;

    // container should always bind itself
    this.bindInstance(Container, this);
  }

  /**
   * Returns array of all service keys. This basically returns keys from all .bindXXX calls.
   * @returns {Array} array of service keys
   */
  public get servicesKeys(): IOC.ServiceKey[] {
    return [...this.fServices.keys()];
  }

  /**
   * Returns events handler.
   */
  public get events(): ContainerEvents {
    return this.fContainerEvents;
  }

  /**
   * Binds particular key to container in singleton scope. Multiple queries/injects of this
   * service will always return the same instance.
   *
   * @param key key of service, preferably class or abstract class
   * @param value implementation
   */
  public bind<T>(key: IOC.ServiceKey<T>, value?: IOC.ServiceValue<T>): void {

    const newDef = {
      serviceKey: key,
      serviceValue: value ?? key,
      type: IOC.ServiceFactoryType.CLASS_SINGLETON,
    };

    if (typeof key === 'symbol' && !value) {
      throw new Error('Container - provide implementation for binds with symbols.');
    }

    const existingServiceDef = this.fServices.get(key);
    if (existingServiceDef) {
      this.internalDispose(existingServiceDef);
    }

    this.fServices.set(key, newDef);
    this.fNewQueue.set(key, newDef);
  }

  /**
   * Binds particular key to container in transient scope. Every query/@Inject of this service
   * will have totally brand-new instance of class.
   * @param key key of service, preferably class or abstract class
   * @param value implementation
   */
  public bindTransient<T>(key: IOC.ServiceKey<T>, value?: IOC.ServiceValue<T>): void {

    const newDef = {
      serviceKey: key,
      serviceValue: value ?? key,
      type: IOC.ServiceFactoryType.CLASS,
    };

    const existingServiceDef = this.fServices.get(key);
    if (existingServiceDef) {
      this.internalDispose(existingServiceDef);
    }

    this.fServices.set(key, newDef);
    this.fNewQueue.set(key, newDef);
  }

  /**
   * Binds particular key class to an existing class instance. If you use this method,
   * class wont be instantiated automatically. The common use case is to
   * share single class instance between two or more containers.
   *
   * @param key key of service, preferably class or abstract class
   * @param value instance of class to be used as resolution
   */
  public bindInstance<T>(key: IOC.ServiceKey<T>, value: T): void {

    const newDef = {
      serviceKey: key,
      serviceValue: value,
      type: IOC.ServiceFactoryType.INSTANCE,
    };

    const existingServiceDef = this.fServices.get(key);
    if (existingServiceDef) {
      this.internalDispose(existingServiceDef);
    }

    this.fServices.set(key, newDef);
    this.fNewQueue.set(key, newDef);
  }

  /**
   * Binds mocked instance to a particular service ID. Its designed to be used in unit tests, where you can quickly
   * replace real IOC implementation with a partial stub. Please note, you are responsible to provide enough data
   * for test to pass, TypeScript wont check it.
   *
   * Example:
   *
   * container.bind(HttpServer, {
   *   listen: jest.fn(),
   * });
   *
   * @param key service to be replaced
   * @param mockInstance mock instance
   */
  public bindMock<T>(key: IOC.ServiceKey<T>, mockInstance: Partial<T>): void {

    const newDef = {
      serviceKey: key,
      serviceValue: mockInstance,
      type: IOC.ServiceFactoryType.INSTANCE,
    };

    const existingServiceDef = this.fServices.get(key);
    if (existingServiceDef) {
      this.internalDispose(existingServiceDef);
    }

    this.fServices.set(key, newDef);
    this.fNewQueue.set(key, newDef);
  }

  /**
   * Returns implementation for a particular key class. This is the same as @Inject,
   * but triggered programitically.
   * @param key key used in .bind() function to bind key class to implementation class
   * @returns service for identifier
   */
  public get<T>(key: IOC.ServiceKey<T>): T {
    return this.internalGet(key);
  }

  /**
   * Returns implementation for a particular key class. This is the same as @Inject,
   * but triggered programitically.
   * @param key key used in .bind() function to bind key class to implementation class
   * @returns service for identifier
   */
  public getOptional<T>(key: IOC.ServiceKey<T>): T | null {
    return this.internalGetOptional(key);
  }

  /**
   * Uses the container provider to register multiple things in IOC container at once.
   * @param provider provider that will register new services into IOC container
   */
  public use(provider: IOC.ProviderFunc): void {
    provider(this);
  }

  /**
   * Expands container during runtime, adding new services to it.
   * @param providers functor that is used to expand the container
   * @param flush whether container should be flushed now or not
   */
  public expand(providers: IOC.ProviderFunc | IOC.ProviderFunc[], flush: boolean = true): void {

    const preLockState = this.fLocked;
    const allProviders = Array.isArray(providers) ? providers : [providers];

    try {
      this.fLocked = false;

      for (const provider of allProviders) {
        this.use(provider);
      }

      // call internal container event
      const newKeys = [...this.fNewQueue.keys()]
        .filter((k) => !this.fSingletonInstances.has(k));

      this.fContainerEvents.callOnExpanded(newKeys);

      // initialize all new services
      if (flush) {
        this.flushQueue();
      }

    } finally {
      this.fLocked = preLockState;
    }

  }

  /**
   * Creates instance of particular class using, respecting all @Injects inside created class.
   * @param classType type of class to instantiate
   * @param method (optional) inject method
   * @returns new class instance with dependencies
   */
  public resolve<T>(classType: IOC.Newable<T>, method: IOC.InjectMethod = IOC.InjectMethod.LAZY): T {
    const constructorDependencies = this.getConstructorDependencies(classType);
    const newInstance = new classType(...constructorDependencies);
    this.internalProcessInjects(newInstance, method);
    return newInstance;
  }

  /**
   * Returns all IOC services registered in container.
   * @returns array with all registered services
   */
  public getAllServices(): IOC.Instance[] {
    return this.servicesKeys.map((k) => this.get(k));
  }

  /**
   * Unlocks the container, allowing things to be retrieved and used.
   */
  public unlock(): void {
    this.fLocked = false;
  }

  /**
   * Locks the container, disabling to add new services here.
   */
  public lock(): void {
    this.fLocked = true;
  }

  /**
   * Flushes new services queue, registering them into container.
   */
  public flushQueue(): void {
    // Note:
    // For performance reasons we use simple loops here & continue operator,
    // we need maximum performance here...

    // avoid taking any actions if queue is empty
    if (this.fNewQueue.size === 0) {
      return;
    }

    // auto-initialize all singletons to make sure @Listen() decorator will work on those types
    const values = [...this.fNewQueue.values()];
    for (const def of values) {
      if (def.type !== IOC.ServiceFactoryType.CLASS_SINGLETON) {
        continue;
      }

      const instance = this.internalResolve(def);
      initializeDecorators(instance, this);
    }

    this.fNewQueue.clear();
  }

  /* eslint-disable @typescript-eslint/no-unused-vars */
  /**
   * Internally retrieve dependency from container.
   * @param key key to get
   * @param parent parent (for debugging purposes)
   * @returns queried instance
   */
  protected internalGet<T>(key: IOC.ServiceKey<T>, parent?: IOC.Instance): T {
    const serviceDef = this.fServices.get(key);
    if (!serviceDef) {
      throw new Error(`Unresolved dependency for [${this.getKeyDescription(key)}]`);
    }

    return this.internalResolve(serviceDef) as T;
  }
  /* eslint-enable @typescript-eslint/no-unused-vars */

  /**
   * Internally retrieve dependency from container.
   * @param key key to get
   * @param parent parent
   * @returns queried instance
   */
  protected internalGetOptional<T>(key: IOC.ServiceKey<T>): T | null {
    const serviceDef = this.fServices.get(key);
    if (!serviceDef) {
      return null;
    }

    return this.internalResolve(serviceDef) as T;
  }

  /**
   * Internally resolves service def, turning it into class instance with deps injected.
   * @param serviceDef service def to resolve
   * @returns class instance
   */
  protected internalResolve(serviceDef: IOC.ServiceDef): IOC.Instance {

    // depending on inject type, make proper actions
    switch (serviceDef.type) {
      case IOC.ServiceFactoryType.INSTANCE: {
        return serviceDef.serviceValue;
      }

      case IOC.ServiceFactoryType.CLASS_SINGLETON: {
        if (!this.fSingletonInstances.has(serviceDef.serviceKey)) {
          const constructor = (serviceDef.serviceValue as IOC.Newable<unknown>);
          const constructorDeps = this.getConstructorDependencies(constructor);
          const instance = new constructor(...constructorDeps);
          this.fSingletonInstances.set(serviceDef.serviceKey, instance);
          this.internalProcessInjects(instance, this.fInjectMethod);
          return instance;
        }

        return this.fSingletonInstances.get(serviceDef.serviceKey);
      }

      case IOC.ServiceFactoryType.CLASS: {
        const constructor = (serviceDef.serviceValue as IOC.Newable<unknown>);
        const constructorDeps = this.getConstructorDependencies(constructor);
        const instance = new constructor(...constructorDeps);
        this.internalProcessInjects(instance, this.fInjectMethod);
        return instance;
      }

      default: {
        throw new Error(`Container - invalid factory type: ${serviceDef.type}`);
      }

    }

  }

  /**
   * Internally inject deps for particular class..
   * @param instance instance to inject
   * @param method method for injecting dependencies, either lazy or static
   */
  protected internalProcessInjects(instance: IOC.Instance, method: IOC.InjectMethod): void {

    // for lazy method its simple, just inject everything and we're good to go
    if (method === IOC.InjectMethod.LAZY) {
      IOCEngine.injectDeps(this, instance, IOC.InjectMethod.LAZY);
      return;
    }

    // for "static" inject type its more complicated, because we often have A->B->C->D->A dependency,
    // its means we cannot make simple recursive instantiation of injects.
    //
    // instead we must do it in two passes - first, create all class instances walking through @Inject
    // dependencies but WITHOUT actually injecting anything - this is a "planning" phase.
    //
    // after we have empty instances, second pass will iterate through them and fill it with dependencies
    // in "filling" phase.
    //

    // holds current queue to process, we will iterate over deps until we clean the queue
    const processQueue: IOC.Instance[] = [];

    // holds unique set of service keys that we walked through, to prevent walking through same service multiple times
    const elementSet: Set<IOC.ServiceKey> = new Set();

    // array of elements that should be processed in 2nd , "filling" phase
    const toProcessElements: IOC.Instance[] = [];

    // at the start, our queue & fill should start with instance we want to create...
    processQueue.push(instance);
    toProcessElements.push(instance);

    // process queue until there is nothing left to process
    while (processQueue.length > 0) {

      // get last element from queue, we are getting last element to prevent array reallocation (its faster)
      const element = processQueue.pop();

      // get all @Injects for this element
      const deps = IOCEngine.getDeps(element);

      // process them...
      for (const inj of deps) {

        // if we did not processed this service yet, process it...
        if (!elementSet.has(inj.dependency)) {

          // should dep be optional?
          const isOptional = (inj.type === IOC.DependencyType.OPTIONAL);

          // create empty instance & save it
          const childInstance = (isOptional)
            ? this.internalGetOptional(inj.dependency)
            : this.internalGet(inj.dependency, instance);

          elementSet.add(inj.dependency);

          // add it to "filling" phase list
          if (!isOptional) {
            processQueue.push(childInstance);
            toProcessElements.push(childInstance);
          }

        }
      }

    }

    // this is "filling" phase, basically now @Inject everyting we have collected within "planning" phase
    for (const el of toProcessElements) {
      IOCEngine.injectDeps(this, el, IOC.InjectMethod.STATIC);
    }

  }

  /**
   * Disposes a module, clearing everything allocated to it.
   * @param def def that should be disposed
   */
  protected internalDispose(def: IOC.ServiceDef): void {

    switch (def.type) {

      case IOC.ServiceFactoryType.INSTANCE: {
        destroyDecorators(def.serviceValue as IDecoratedInstance, this);
        break;
      }

      case IOC.ServiceFactoryType.CLASS_SINGLETON: {
        const existingInstance = this.fSingletonInstances.get(def.serviceKey);
        // it might not exist yet because container is in initializing phase..
        if (existingInstance) {
          destroyDecorators(existingInstance, this);
        }
        break;
      }

      case IOC.ServiceFactoryType.CLASS: {
        // its not easily possible to drop raw instance
        break;
      }

      default: {
        throw new Error(`Container::internalDispose() - invalid def type: ${def.type}`);
      }

    }
  }

  /**
   * Describes particular key for better error messaging.
   * @param key service key
   * @returns string representation of service key
   */
  protected getKeyDescription(key: IOC.ServiceKey): string {
    if (typeof key === 'symbol') {
      return key.description!;
    } else if (typeof key === 'function') {
      return key.name;
    } else if (typeof key === 'object') {
      return key.constructor?.name ?? 'Unknown object';
    }

    return 'Unknown';
  }

  protected getConstructorDependencies(classType: IOC.Newable<unknown>): unknown[] {
    const deps = IOCEngine.getDeps(classType, true);
    const ctorDeps = deps.filter(dep => !dep.propertyName && dep.propertyIndex != null);

    const ctorDepValues: unknown[] = [];

    for (const dep of ctorDeps) {
      let ctorDepValue: unknown;

      if (dep.type === IOC.DependencyType.STANDARD) {
        ctorDepValue = this.get(dep.dependency);
      }
      if (dep.type === IOC.DependencyType.OPTIONAL) {
        ctorDepValue = this.getOptional(dep.dependency);
      }

      if (!ctorDepValue) {
        throw new Error(`Invalid dependency type ${dep.type}`);
      }

      ctorDepValues[dep.propertyIndex] = ctorDepValue;
    }

    return ctorDepValues;
  }
}
