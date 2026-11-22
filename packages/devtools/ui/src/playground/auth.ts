import type { Credentials } from './request';

/**
 * Credentials of the route playground.
 *
 * They live in memory. Writing them to storage is something the user asks for
 * with a checkbox, and unticking it removes them again. They are applied when
 * a request is built and are never part of a draft, so they reach neither the
 * history nor a URL.
 */

/** The kinds of credential the playground can send. */
export type AuthKind = 'none' | 'bearer' | 'basic' | 'apikey' | 'cookie';

/** What the user entered. Every kind keeps its own fields, so switching kinds loses nothing. */
export interface AuthState {
  kind: AuthKind;
  token: string;
  username: string;
  password: string;
  keyName: string;
  keyValue: string;
  cookieName: string;
  cookieValue: string;
  /** Whether the user asked for the values to be kept in `localStorage`. */
  remember: boolean;
}

/** The slice of `Storage` this module needs. */
export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

/** Storage key of remembered credentials. */
export const AUTH_STORAGE_KEY = 'vercube-devtools-playground-auth';

const KINDS: ReadonlySet<string> = new Set(['none', 'bearer', 'basic', 'apikey', 'cookie']);

/**
 * The state before anything is entered.
 *
 * @returns An empty state
 */
export function emptyAuth(): AuthState {
  return {
    kind: 'none',
    token: '',
    username: '',
    password: '',
    keyName: 'x-api-key',
    keyValue: '',
    cookieName: '',
    cookieValue: '',
    remember: false,
  };
}

/**
 * Whether the state would add anything to a request.
 *
 * @param auth - The entered credentials
 * @returns True when the selected kind has its value filled in
 */
export function hasCredentials(auth: AuthState): boolean {
  return toCredentials(auth).headers.length + toCredentials(auth).cookies.length > 0;
}

/**
 * Encodes text as base64, including characters outside Latin-1.
 *
 * @param text - The text
 * @returns The base64 form of its UTF-8 bytes
 */
function base64(text: string): string {
  return btoa(String.fromCodePoint(...new TextEncoder().encode(text)));
}

/**
 * Turns the entered credentials into what a request carries.
 *
 * @param auth - The entered credentials
 * @returns The headers and cookies to add; both empty when nothing usable is entered
 */
export function toCredentials(auth: AuthState): Credentials {
  switch (auth.kind) {
    case 'bearer': {
      return { headers: auth.token ? [{ name: 'Authorization', value: `Bearer ${auth.token}` }] : [], cookies: [] };
    }
    case 'basic': {
      return {
        headers:
          auth.username || auth.password
            ? [{ name: 'Authorization', value: `Basic ${base64(`${auth.username}:${auth.password}`)}` }]
            : [],
        cookies: [],
      };
    }
    case 'apikey': {
      return {
        headers: auth.keyName.trim() && auth.keyValue ? [{ name: auth.keyName.trim(), value: auth.keyValue }] : [],
        cookies: [],
      };
    }
    case 'cookie': {
      return {
        headers: [],
        cookies: auth.cookieName.trim() && auth.cookieValue ? [{ name: auth.cookieName.trim(), value: auth.cookieValue }] : [],
      };
    }
    default: {
      return { headers: [], cookies: [] };
    }
  }
}

/**
 * Reads remembered credentials.
 *
 * @param storage - Where they were kept, or null when storage is unavailable
 * @returns The remembered state, or an empty one
 */
export function loadAuth(storage: StorageLike | null): AuthState {
  const initial = emptyAuth();

  try {
    const stored = JSON.parse(storage?.getItem(AUTH_STORAGE_KEY) ?? 'null') as Partial<AuthState> | null;

    if (!stored || typeof stored !== 'object') {
      return initial;
    }

    for (const key of Object.keys(initial) as (keyof AuthState)[]) {
      if (key !== 'kind' && key !== 'remember' && typeof stored[key] === 'string') {
        initial[key] = stored[key];
      }
    }

    return { ...initial, kind: KINDS.has(stored.kind as AuthKind) ? (stored.kind as AuthKind) : 'none', remember: true };
  } catch {
    return initial;
  }
}

/**
 * Keeps the credentials when the user asked for that, and removes what was
 * kept when they did not.
 *
 * @param storage - Where to keep them, or null when storage is unavailable
 * @param auth - The entered credentials
 */
export function persistAuth(storage: StorageLike | null, auth: AuthState): void {
  try {
    if (auth.remember) {
      storage?.setItem(AUTH_STORAGE_KEY, JSON.stringify(auth));
    } else {
      storage?.removeItem(AUTH_STORAGE_KEY);
    }
  } catch {
    // Storage that is full or blocked leaves the credentials in memory only.
  }
}
