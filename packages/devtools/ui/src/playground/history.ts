import type { StorageLike } from './auth';
import type { Draft } from './request';
import type { Pair } from './url';

/**
 * History and saved requests of the route playground, per route.
 *
 * They are kept in the browser and nowhere else. Credentials are not part of
 * a draft, so they cannot end up here. A value the user typed by hand under a
 * name that looks like a credential is another matter: a header of that kind
 * is always stored without its value, and so is a query entry or a form field
 * unless the user ticked "Remember on this device" for credentials.
 *
 * The storage is shared with the frontend of the application, which lives on
 * the same origin, so the history keeps well below the quota: a body above a
 * few kilobytes is not stored, an entry that is still large is not kept, and
 * the oldest entries go when the whole would pass {@link MAX_TOTAL}.
 */

/** One sent or saved request. */
export interface HistoryEntry {
  id: string;
  /** Unix epoch milliseconds. */
  at: number;
  /** Route the entry belongs to: `${method} ${template}`. */
  route: string;
  method: string;
  /** Path and query that were sent, with the values of credentials removed. */
  target: string;
  draft: Draft;
  /** Response status, absent when the request failed before a response. */
  status?: number;
  durationMs?: number;
  /** Set on saved requests, which are kept until removed. */
  name?: string;
}

/** What may be stored. */
export interface StoreOptions {
  /**
   * True when the user asked for credentials to be kept on this device. Query
   * and form values under a credential's name are then stored as they were
   * typed.
   */
  keepCredentials?: boolean;
}

/** Storage key of the history. */
export const HISTORY_STORAGE_KEY = 'vercube-devtools-playground-history';

/** Unsaved entries kept per route. */
const PER_ROUTE = 15;

/** Unsaved entries kept in total. */
const TOTAL = 150;

/** Largest body text stored with an entry, in characters. */
export const MAX_BODY = 4 * 1024;

/** Largest entry kept, in characters of its JSON. */
export const MAX_ENTRY = 16 * 1024;

/**
 * Largest history written to storage, in characters of its JSON. A browser
 * gives an origin about five million; this is a twentieth of that.
 */
export const MAX_TOTAL = 256 * 1024;

/** Header names whose values are never stored. */
const CREDENTIAL = /^(?:proxy-)?authorization$|^cookie$|token|secret|passw(?:or)?d|credential|api-?key|session/i;

/** Query and form names whose values are stored only when the user asked for credentials to be kept. */
const CREDENTIAL_VALUE = /token|key|secret|passw(?:or)?d|authorization/i;

/** Written in place of a credential in a stored target. */
const REDACTED = 'redacted';

/** The body modes a stored draft may name. */
const BODY_MODES: ReadonlySet<string> = new Set(['none', 'json', 'text', 'form']);

/**
 * Whether a query entry or a form field is named like a credential.
 *
 * @param name - Name of the entry
 * @returns True for names such as `token`, `api_key` or `password`
 */
export function looksLikeCredential(name: string): boolean {
  return CREDENTIAL_VALUE.test(name);
}

/**
 * Removes the values of credentials from the query of a target.
 *
 * @param target - Path and query
 * @returns The target, with `redacted` in place of each credential
 */
export function redactTarget(target: string): string {
  const mark = target.indexOf('?');

  if (mark === -1) {
    return target;
  }

  const query = target
    .slice(mark + 1)
    .split('&')
    .map((entry) => {
      const equals = entry.indexOf('=');
      const name = equals === -1 ? entry : entry.slice(0, equals);
      let decoded = name;

      try {
        decoded = decodeURIComponent(name.replaceAll('+', ' '));
      } catch {
        // A name that does not decode is compared as it is written.
      }

      return equals !== -1 && looksLikeCredential(decoded) ? `${name}=${REDACTED}` : entry;
    })
    .join('&');

  return `${target.slice(0, mark)}?${query}`;
}

/**
 * Copies a list of pairs, emptying the values of credentials.
 *
 * @param pairs - Query entries or form fields
 * @param keep - Whether credentials are kept
 * @returns The copy
 */
function storedPairs(pairs: Pair[], keep: boolean): Pair[] {
  return pairs.map((pair) => ({ name: pair.name, value: !keep && looksLikeCredential(pair.name) ? '' : pair.value }));
}

/**
 * Copies a draft without anything that must not be stored.
 *
 * @param draft - The draft that was sent
 * @param options - Whether the user asked for credentials to be kept
 * @returns A copy safe to keep in storage
 */
export function sanitiseDraft(draft: Draft, options: StoreOptions = {}): Draft {
  const keep = options.keepCredentials === true;

  return {
    method: draft.method,
    params: { ...draft.params },
    query: storedPairs(draft.query, keep),
    headers: draft.headers.map((pair) => ({ name: pair.name, value: CREDENTIAL.test(pair.name.trim()) ? '' : pair.value })),
    bodyMode: draft.bodyMode,
    body: draft.body.length > MAX_BODY ? '' : draft.body,
    form: storedPairs(draft.form, keep),
  };
}

/**
 * Reads a list of pairs out of stored data.
 *
 * @param value - What storage held
 * @returns The pairs, or null when the value is not a list of them
 */
function parsePairs(value: unknown): Pair[] | null {
  if (!Array.isArray(value)) {
    return null;
  }

  const pairs: Pair[] = [];

  for (const item of value as unknown[]) {
    const pair = item as Partial<Pair> | null;

    if (typeof pair !== 'object' || pair === null || typeof pair.name !== 'string' || typeof pair.value !== 'string') {
      return null;
    }

    pairs.push({ name: pair.name, value: pair.value });
  }

  return pairs;
}

/**
 * Reads a draft out of stored data.
 *
 * Storage is shared with whatever else runs on the origin and outlives the
 * version of devtools that wrote it, so a draft is rebuilt field by field and
 * refused as a whole when any field is not what the form can hold.
 *
 * @param value - What storage held
 * @returns The draft, or null when the value is not one
 */
export function parseDraft(value: unknown): Draft | null {
  const stored = value as Partial<Record<keyof Draft, unknown>> | null;

  if (typeof stored !== 'object' || stored === null) {
    return null;
  }

  const query = parsePairs(stored.query);
  const headers = parsePairs(stored.headers);
  const form = parsePairs(stored.form);
  const params = stored.params;

  if (
    typeof stored.method !== 'string' ||
    typeof stored.body !== 'string' ||
    typeof stored.bodyMode !== 'string' ||
    !BODY_MODES.has(stored.bodyMode) ||
    typeof params !== 'object' ||
    params === null ||
    Array.isArray(params) ||
    Object.values(params).some((entry) => typeof entry !== 'string') ||
    !query ||
    !headers ||
    !form
  ) {
    return null;
  }

  return {
    method: stored.method,
    params: { ...(params as Record<string, string>) },
    query,
    headers,
    bodyMode: stored.bodyMode as Draft['bodyMode'],
    body: stored.body,
    form,
  };
}

/**
 * Reads an entry out of stored data.
 *
 * @param value - What storage held
 * @returns The entry, or null when the value is not one
 */
function parseEntry(value: unknown): HistoryEntry | null {
  const stored = value as Partial<Record<keyof HistoryEntry, unknown>> | null;

  if (typeof stored !== 'object' || stored === null) {
    return null;
  }

  const draft = parseDraft(stored.draft);

  if (
    !draft ||
    typeof stored.id !== 'string' ||
    typeof stored.at !== 'number' ||
    typeof stored.route !== 'string' ||
    typeof stored.method !== 'string' ||
    typeof stored.target !== 'string' ||
    (stored.status !== undefined && typeof stored.status !== 'number') ||
    (stored.durationMs !== undefined && typeof stored.durationMs !== 'number') ||
    (stored.name !== undefined && typeof stored.name !== 'string')
  ) {
    return null;
  }

  return {
    id: stored.id,
    at: stored.at,
    route: stored.route,
    method: stored.method,
    target: stored.target,
    draft,
    status: stored.status,
    durationMs: stored.durationMs,
    name: stored.name,
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
   * @param options - Whether the user asked for credentials to be kept
   * @returns The entry as it is stored. It is not kept when it is too large, see {@link has}.
   */
  public record(entry: Omit<HistoryEntry, 'id' | 'draft'> & { draft: Draft }, options: StoreOptions = {}): HistoryEntry {
    const stored: HistoryEntry = {
      ...entry,
      id: this.nextId(entry.at),
      target: options.keepCredentials === true ? entry.target : redactTarget(entry.target),
      draft: sanitiseDraft(entry.draft, options),
      name: undefined,
    };

    this.fEntries = this.fit(this.trim([stored, ...this.fEntries], entry.route));
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
   * @param options - Whether the user asked for credentials to be kept
   * @returns The saved request. It is not kept when it is too large, see {@link has}.
   */
  public save(route: string, name: string, draft: Draft, target: string, options: StoreOptions = {}): HistoryEntry {
    const at = Date.now();
    const shown = options.keepCredentials === true ? target : redactTarget(target);
    const stored: HistoryEntry = {
      id: this.nextId(at),
      at,
      route,
      method: draft.method,
      target: shown,
      draft: sanitiseDraft(draft, options),
      name: name.trim() || shown,
    };

    this.fEntries = this.fit([stored, ...this.fEntries]);
    this.write();

    return stored;
  }

  /**
   * Whether an entry is kept. An entry too large for the history is handed
   * back by {@link record} and {@link save} and then let go.
   *
   * @param id - Id of the entry
   * @returns True when the history holds it
   */
  public has(id: string): boolean {
    return this.fEntries.some((entry) => entry.id === id);
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
   * Keeps the history within its size: an entry above {@link MAX_ENTRY} is
   * let go, then the oldest entries until the whole fits {@link MAX_TOTAL}.
   * Unsaved entries go first, saved requests only when nothing else is left.
   *
   * @param entries - Entries, newest first
   * @returns The entries that are kept
   */
  private fit(entries: HistoryEntry[]): HistoryEntry[] {
    const sized = entries
      .map((entry) => ({ entry, size: JSON.stringify(entry).length + 1 }))
      .filter(({ size }) => size <= MAX_ENTRY);

    let total = sized.reduce((sum, { size }) => sum + size, 2);

    for (const saved of [false, true]) {
      for (let index = sized.length - 1; index >= 0 && total > MAX_TOTAL; index--) {
        if ((sized[index].entry.name !== undefined) === saved) {
          total -= sized[index].size;
          sized.splice(index, 1);
        }
      }
    }

    return sized.map(({ entry }) => entry);
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
        ? this.fit((stored as unknown[]).map((entry) => parseEntry(entry)).filter((entry) => entry !== null))
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
