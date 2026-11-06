import { initializeMetadata, initializeMetadataMethod } from '../../Utils/Utils';
import type { HttpError } from '../../Errors/HttpError';
import type { MetadataTypes } from '../../Types/MetadataTypes';

/**
 * A class of `HttpError`. Its static `status` says which status it answers
 * with; every built-in error declares one.
 */
export type HttpErrorClass = (abstract new (...args: any[]) => HttpError) & { readonly status?: number };

/** One error a route declares it can answer with. */
export interface ThrownError {
  /** The class name, which the client typegen resolves to an importable type. */
  name: string;
  status: number;
  error: HttpErrorClass;
}

/** Metadata key of the class-level declarations, in `__metadata.__meta`. */
const CLASS_KEY = 'throws';

/**
 * Declares the HTTP errors a route can answer with, so the generated client
 * types and the OpenAPI document know about them.
 *
 * It is a declaration, not a filter: an error that is not declared still
 * reaches the client exactly as before. Stack it, or put it on the controller
 * class to apply it to every route in it.
 *
 * Each class needs a static `status` (every built-in error has one). For a
 * class without it, pass the status first: `@Throws(409, ConflictError)`.
 *
 * @example
 * ```ts
 * @Get('/:id')
 * @Throws(NotFoundError)
 * public async getUser(@Param('id') id: string): Promise<User> { ... }
 * ```
 *
 * @param errors - Error classes, or a status followed by one error class
 * @returns A decorator for a method or a class
 */
export function Throws(status: number, error: HttpErrorClass): Function;
export function Throws(...errors: HttpErrorClass[]): Function;
export function Throws(...input: (number | HttpErrorClass)[]): Function {
  const entries = resolveEntries(input);

  return function internalDecorator(target: Function | object, propertyName?: string) {
    const prototype = (propertyName ? target : (target as Function).prototype) as MetadataTypes.Metadata;
    const ctx = initializeMetadata(prototype);

    if (propertyName) {
      const method = initializeMetadataMethod(prototype, propertyName);
      // a new array, not a push: a subclass shares its parent's arrays until it writes
      method.meta.throws = mergeThrown((method.meta.throws as ThrownError[] | undefined) ?? [], entries);
      return;
    }

    ctx.__meta = {
      ...ctx.__meta,
      [CLASS_KEY]: mergeThrown((ctx.__meta?.[CLASS_KEY] as ThrownError[] | undefined) ?? [], entries),
    };
  };
}

/**
 * The errors a route declares: its controller's, then its own.
 *
 * @param prototype - Controller prototype
 * @param propertyName - Handler name
 * @returns The declared errors, without duplicates
 */
export function getThrownErrors(prototype: object | undefined, propertyName: string): ThrownError[] {
  const ctx = (prototype as Partial<MetadataTypes.Metadata> | undefined)?.__metadata;
  const fromClass = (ctx?.__meta?.[CLASS_KEY] as ThrownError[] | undefined) ?? [];
  const fromMethod = (ctx?.__methods?.[propertyName]?.meta?.throws as ThrownError[] | undefined) ?? [];

  return mergeThrown(fromClass, fromMethod);
}

/**
 * Turns the decorator arguments into entries, checking every class has a status.
 *
 * @param input - Decorator arguments
 * @returns One entry per error class
 */
function resolveEntries(input: (number | HttpErrorClass)[]): ThrownError[] {
  const entries: ThrownError[] = [];
  let explicit: number | undefined;

  for (const item of input) {
    if (typeof item === 'number') {
      if (!Number.isInteger(item) || item < 400 || item > 599) {
        throw new TypeError(`@Throws(): ${item} is not an error status (400-599).`);
      }

      explicit = item;
      continue;
    }

    if (typeof item !== 'function') {
      throw new TypeError(`@Throws(): expected an HttpError class, got ${typeof item}.`);
    }

    const status = explicit ?? item.status;
    explicit = undefined;

    if (typeof status !== 'number') {
      throw new TypeError(
        `@Throws(${item.name}): the class has no static \`status\`. ` +
          `Add \`static readonly status = <code>\` to it, or write @Throws(<code>, ${item.name}).`,
      );
    }

    entries.push({ name: item.name, status, error: item });
  }

  if (explicit !== undefined) {
    throw new TypeError(`@Throws(${explicit}): a status must be followed by the error class it applies to.`);
  }

  return entries;
}

/**
 * Appends entries that are not there yet, keyed by class and status.
 *
 * @param current - Entries so far
 * @param added - Entries to add
 * @returns A new array
 */
function mergeThrown(current: ThrownError[], added: ThrownError[]): ThrownError[] {
  const result = [...current];

  for (const entry of added) {
    if (!result.some((existing) => existing.error === entry.error && existing.status === entry.status)) {
      result.push(entry);
    }
  }

  return result;
}
