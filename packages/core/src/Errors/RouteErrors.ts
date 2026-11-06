import { getThrownErrors } from '../Decorators/Http/Throws';
import { BadRequestError } from './Http/BadRequestError';
import { ForbiddenError } from './Http/ForbiddenError';
import { UnauthorizedError } from './Http/UnauthorizedError';
import type { HttpErrorClass, ThrownError } from '../Decorators/Http/Throws';
import type { MetadataTypes } from '../Types/MetadataTypes';

/** What an implicit error rule knows about a route. */
export interface RouteErrorContext {
  /** The handler's arguments, as the parameter decorators registered them. */
  args: readonly Pick<MetadataTypes.Arg, 'type' | 'validate' | 'validationSchema'>[];
  /** Whether an authentication middleware guards the route. */
  secured: boolean;
}

/** An error a rule adds, and the module its type is imported from. */
export interface ImplicitError {
  error: HttpErrorClass;
  /** Package (or path) exporting the class, for the generated client types. */
  module: string;
}

/**
 * Adds the errors a route answers with that nobody declares, because the
 * framework throws them itself. A plugin that throws on its own (a rate
 * limiter's 429, say) describes its errors the same way.
 */
export interface ImplicitErrorRule {
  /** Identifies the rule. */
  name: string;
  /** The errors the route gets from this rule, none when it does not apply. */
  errors(route: RouteErrorContext): ImplicitError[];
}

/** One error of a route: declared with `@Throws()`, or implicit with the module to import it from. */
export interface RouteError extends ThrownError {
  /** Set for an implicit error: where its type is imported from. */
  module?: string;
}

/**
 * Errors the framework throws itself. A 500 is not among them on purpose:
 * every route can answer with one, so listing it says nothing.
 */
export const IMPLICIT_ERRORS: readonly ImplicitErrorRule[] = [
  {
    // a validation schema rejecting the input, or a body that is not JSON or form data
    name: 'validation',
    errors: ({ args }) =>
      args.some((arg) => (arg.validate && arg.validationSchema) || arg.type === 'body' || arg.type === 'multipart-form-data')
        ? [{ error: BadRequestError, module: '@vercube/core' }]
        : [],
  },
  {
    // `@Auth()`: missing or invalid credentials, or credentials without the required role
    name: 'auth',
    errors: ({ secured }) =>
      secured
        ? [
            { error: UnauthorizedError, module: '@vercube/core' },
            { error: ForbiddenError, module: '@vercube/core' },
          ]
        : [],
  },
];

/**
 * Every error a route answers with, implicit and declared, sorted by status.
 * What the introspection `routes` section and the OpenAPI document list.
 *
 * @param prototype - Controller prototype
 * @param propertyName - Handler name
 * @param context - The route's arguments and whether it is secured
 * @param rules - Implicit error rules
 * @returns The errors, each class once per status
 */
export function getRouteErrors(
  prototype: object | undefined,
  propertyName: string,
  context: RouteErrorContext,
  rules: readonly ImplicitErrorRule[] = IMPLICIT_ERRORS,
): RouteError[] {
  const errors: RouteError[] = [];
  const add = (entry: RouteError): void => {
    if (!errors.some((existing) => existing.error === entry.error && existing.status === entry.status)) {
      errors.push(entry);
    }
  };

  for (const rule of rules) {
    for (const { error, module } of rule.errors(context)) {
      add({ name: error.name, status: error.status ?? 500, error, module });
    }
  }

  // a declared error the rules already added stays implicit: it is the same class
  for (const entry of getThrownErrors(prototype, propertyName)) {
    add(entry);
  }

  return errors.sort((a, b) => a.status - b.status || a.name.localeCompare(b.name));
}
