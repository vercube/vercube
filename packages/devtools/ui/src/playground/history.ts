import type { StorageLike } from './auth';
import type { Draft } from './request';

/**
 * History and saved requests of the route playground, per route.
 *
 * They are kept in the browser and nowhere else. Credentials are not part of
 * a draft, so they cannot end up here; a header the user typed by hand whose
 * name looks like a credential is stored with its value removed.
 */

/** One sent or saved request. */
export interface HistoryEntry {
  id: string;
  /** Unix epoch milliseconds. */
  at: number;
  /** Route the entry belongs to: `${method} ${template}`. */
  route: string;
  method: string;
  /** Path and query that were sent. */
  target: string;
  draft: Draft;
  /** Response status, absent when the request failed before a response. */
  status?: number;
  durationMs?: number;
  /** Set on saved requests, which are kept until removed. */
  name?: string;
}

/** Storage key of the history. */
export const HISTORY_STORAGE_KEY = 'vercube-devtools-playground-history';

/** Unsaved entries kept per route. */
const PER_ROUTE = 15;

/** Unsaved entries kept in total. */
const TOTAL = 150;

/** Largest body text stored with an entry, in characters. */
const MAX_BODY = 32 * 1024;

/** Header names whose values are never stored. */
const CREDENTIAL = /^(?:proxy-)?authorization$|^cookie$|token|secret|passw(?:or)?d|credential|api-?key|session/i;

/**
 * Copies a draft without anything that must not be stored.
 *
 * @param draft - The draft that was sent
 * @returns A copy safe to keep in storage
 */
export function sanitiseDraft(draft: Draft): Draft {
  return {
    method: draft.method,
    params: { ...draft.params },
    query: draft.query.map((pair) => ({ ...pair })),
    headers: draft.headers.map((pair) => ({ name: pair.name, value: CREDENTIAL.test(pair.name.trim()) ? '' : pair.value })),
    // A cookie is a credential more often than not.
    cookies: draft.cookies.map((pair) => ({ name: pair.name, value: '' })),
    bodyMode: draft.bodyMode,
    body: draft.body.length > MAX_BODY ? '' : draft.body,
    form: draft.form.map((pair) => ({ ...pair })),
  };
}

/**
 * The history, backed by browser storage when there is one.
 */
export class PlaygroundHistory {
  /** Every entry, newest first. */
  private fEntries: HistoryEntry[];

  /** Where the entries are kept, or null to keep them in memory only. */
  private readonly fStorage: StorageLike | null;

  /** Counter that keeps ids unique within one millisecond. */
  private fSequence: number = 0;

  /**
   * @param storage - Browser storage, or null when it is unavailable
   */
  constructor(storage: StorageLike | null) {
    this.fStorage = storage;
    this.fEntries = this.read();
  }

  /**
   * The unsaved entries of a route.
   *
   * @param route - Route key
   * @returns The entries, newest first
   */
  public recent(route: string): HistoryEntry[] {
    return this.fEntries.filter((entry) => entry.route === route && entry.name === undefined);
  }

  /**
   * The saved requests of a route.
   *
   * @param route - Route key
   * @returns The saved requests, newest first
   */
  public saved(route: string): HistoryEntry[] {
    return this.fEntries.filter((entry) => entry.route === route && entry.name !== undefined);
  }

  /**
   * Adds a sent request to the history.
   *
   * @param entry - What was sent and how it ended
   * @returns The stored entry
   */
  public record(entry: Omit<HistoryEntry, 'id' | 'draft'> & { draft: Draft }): HistoryEntry {
    const stored: HistoryEntry = { ...entry, id: this.nextId(entry.at), draft: sanitiseDraft(entry.draft), name: undefined };

    this.fEntries = this.trim([stored, ...this.fEntries], entry.route);
    this.write();

    return stored;
  }

  /**
   * Keeps a request under a name until it is removed.
   *
   * @param route - Route key
   * @param name - Name shown in the list
   * @param draft - The request to keep
   * @param target - Path and query the draft builds
   * @returns The saved request
   */
  public save(route: string, name: string, draft: Draft, target: string): HistoryEntry {
    const at = Date.now();
    const stored: HistoryEntry = {
      id: this.nextId(at),
      at,
      route,
      method: draft.method,
      target,
      draft: sanitiseDraft(draft),
      name: name.trim() || target,
    };

    this.fEntries = [stored, ...this.fEntries];
    this.write();

    return stored;
  }

  /**
   * Removes one entry.
   *
   * @param id - Id of the entry
   */
  public remove(id: string): void {
    this.fEntries = this.fEntries.filter((entry) => entry.id !== id);
    this.write();
  }

  /**
   * Removes the unsaved entries of a route.
   *
   * @param route - Route key
   */
  public clear(route: string): void {
    this.fEntries = this.fEntries.filter((entry) => entry.route !== route || entry.name !== undefined);
    this.write();
  }

  /**
   * Builds an id for a new entry.
   *
   * @param at - Timestamp of the entry
   * @returns An id unique within this store
   */
  private nextId(at: number): string {
    return `${at.toString(36)}-${(this.fSequence++).toString(36)}`;
  }

  /**
   * Drops the oldest unsaved entries past the limits.
   *
   * @param entries - Entries, newest first
   * @param route - Route that just received an entry
   * @returns The entries that are kept
   */
  private trim(entries: HistoryEntry[], route: string): HistoryEntry[] {
    let ofRoute = 0;
    let unsaved = 0;

    return entries.filter((entry) => {
      if (entry.name !== undefined) {
        return true;
      }

      unsaved++;

      if (entry.route === route) {
        ofRoute++;

        return ofRoute <= PER_ROUTE && unsaved <= TOTAL;
      }

      return unsaved <= TOTAL;
    });
  }

  /**
   * Reads the stored entries, discarding anything that is not one.
   *
   * @returns The entries, newest first
   */
  private read(): HistoryEntry[] {
    try {
      const stored = JSON.parse(this.fStorage?.getItem(HISTORY_STORAGE_KEY) ?? '[]') as unknown;

      return Array.isArray(stored)
        ? stored.filter(
            (entry): entry is HistoryEntry =>
              typeof entry === 'object' &&
              entry !== null &&
              typeof (entry as HistoryEntry).id === 'string' &&
              typeof (entry as HistoryEntry).route === 'string' &&
              typeof (entry as HistoryEntry).draft === 'object' &&
              (entry as HistoryEntry).draft !== null,
          )
        : [];
    } catch {
      return [];
    }
  }

  /**
   * Writes the entries back. A full or blocked storage keeps them in memory.
   */
  private write(): void {
    try {
      this.fStorage?.setItem(HISTORY_STORAGE_KEY, JSON.stringify(this.fEntries));
    } catch {
      // Nothing to do: the history still works for this session.
    }
  }
}
