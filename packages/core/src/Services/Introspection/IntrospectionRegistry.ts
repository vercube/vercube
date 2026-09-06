import type { IntrospectionTypes } from '../../Types/IntrospectionTypes';

/**
 * Registry of everything that can describe the running application.
 *
 * One place to ask "what does this app look like", instead of every consumer
 * reaching into `Router`, `Container` and the config on its own. Sections are
 * memoized against the revision they were built from, which is what stops a
 * consumer that renders four panels from rebuilding the dependency graph four
 * times.
 */
export class IntrospectionRegistry {
  /** Registered providers, by id. */
  private readonly fProviders = new Map<string, IntrospectionTypes.Provider>();

  /** Last described data per provider, keyed by the revision it was built from. */
  private readonly fCache = new Map<string, { revision: number; data: unknown }>();

  /** Listeners notified by {@link IntrospectionRegistry.touch}. */
  private readonly fListeners = new Set<IntrospectionTypes.InvalidateListener>();

  /**
   * Registers a provider.
   *
   * @param provider - The provider to register
   * @returns A function that unregisters it again
   */
  public register<T>(provider: IntrospectionTypes.Provider<T>): () => void {
    this.fProviders.set(provider.id, provider as IntrospectionTypes.Provider);
    this.fCache.delete(provider.id);

    return () => {
      if (this.fProviders.get(provider.id) === (provider as IntrospectionTypes.Provider)) {
        this.fProviders.delete(provider.id);
        this.fCache.delete(provider.id);
      }
    };
  }

  /**
   * Whether a provider is registered under this id.
   *
   * @param id - The section id
   * @returns True when the section exists
   */
  public has(id: string): boolean {
    return this.fProviders.has(id);
  }

  /**
   * Lists the registered sections and their current revisions, without
   * describing any of them.
   *
   * @returns One descriptor per section, sorted by id
   */
  public list(): IntrospectionTypes.Descriptor[] {
    return [...this.fProviders.values()]
      .map((provider) => ({ id: provider.id, title: provider.title, revision: provider.revision() }))
      .sort((a, b) => a.id.localeCompare(b.id));
  }

  /**
   * Describes one section, reusing the cached result while its revision holds.
   *
   * @param id - The section id
   * @returns The section, or undefined when nothing is registered under `id`
   */
  public async describe<T = unknown>(id: string): Promise<IntrospectionTypes.Section<T> | undefined> {
    const provider = this.fProviders.get(id);

    if (!provider) {
      return undefined;
    }

    const revision = provider.revision();
    const cached = this.fCache.get(id);

    if (cached?.revision === revision) {
      return { id, title: provider.title, revision, data: cached.data as T };
    }

    const data = await provider.describe();
    this.fCache.set(id, { revision, data });

    return { id, title: provider.title, revision, data: data as T };
  }

  /**
   * Describes every registered section.
   *
   * @returns Sections by id
   */
  public async describeAll(): Promise<Record<string, IntrospectionTypes.Section>> {
    const sections = await Promise.all([...this.fProviders.keys()].map((id) => this.describe(id)));
    const result: Record<string, IntrospectionTypes.Section> = {};

    for (const section of sections) {
      if (section) {
        result[section.id] = section;
      }
    }

    return result;
  }

  /**
   * Announces that a section changed.
   *
   * Providers own their revision, so the cache would notice a change on the
   * next `describe()` anyway. This is what turns that into a push, so a live
   * consumer does not have to poll.
   *
   * @param id - The section that changed
   */
  public touch(id: string): void {
    const provider = this.fProviders.get(id);

    if (!provider) {
      return;
    }

    const revision = provider.revision();

    for (const listener of this.fListeners) {
      try {
        listener(id, revision);
      } catch {
        // A broken consumer must not take the application down.
      }
    }
  }

  /**
   * Subscribes to section changes.
   *
   * @param listener - Called with the id and new revision
   * @returns A function that unsubscribes
   */
  public onInvalidate(listener: IntrospectionTypes.InvalidateListener): () => void {
    this.fListeners.add(listener);

    return () => {
      this.fListeners.delete(listener);
    };
  }

  /**
   * Drops memoized data, forcing the next `describe()` to rebuild.
   *
   * @param id - The section to clear, or every section when omitted
   */
  public clearCache(id?: string): void {
    if (id === undefined) {
      this.fCache.clear();
      return;
    }

    this.fCache.delete(id);
  }
}
