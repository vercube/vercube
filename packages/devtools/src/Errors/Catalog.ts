import { NotFoundError } from '@vercube/core';
import { defineErrorCatalog } from '@vercube/di';

/**
 * The errors of `@vercube/devtools`. Both answer a devtools API call with a 404.
 */
export const DevtoolsErrors = defineErrorCatalog(
  'VERCUBE_DEVTOOLS',
  {
    UNKNOWN_SECTION: {
      message: ({ id }: { id: string }) => `Unknown introspection section: ${id}`,
      why: 'The devtools API was asked for an introspection section that no provider registered. A section exists only when the package that describes it is part of the application.',
      fix: 'Request one of the ids listed by `GET /_devtools/api/introspect` (under the `path` option of the devtools, `/_devtools` by default), and register the plugin of the package the missing section belongs to.',
    },
    UNKNOWN_SIGNAL: {
      message: ({ kind }: { kind: string }) => `Unknown signal: ${kind}`,
      why: 'The devtools API was asked for a telemetry signal it does not keep. The path parameter of `/_devtools/api/signals/:kind` only takes the three signal names.',
      fix: 'Use `traces`, `metrics` or `logs` as the `kind`, for example `GET /_devtools/api/signals/traces`.',
    },
    PLAYGROUND_PATTERN_METHOD_UNKNOWN: {
      message: ({ pattern, method }: { pattern: string; method: string }) =>
        `Invalid route pattern "${pattern}": "${method}" is not an HTTP method.`,
      why: 'A pattern of `playground.exclude` has two words, and the first is not a method the router knows. A pattern that cannot be read would exclude nothing, so the plugin refuses to start with it.',
      fix: 'Start the pattern with `GET`, `POST`, `PUT`, `PATCH`, `DELETE`, `HEAD` or `OPTIONS`, for example `DELETE /users/:id`, or leave the method out to cover every method of the path.',
      // bare-error: a mistake in the plugin options, not an answer to a request
      create: (message) => new Error(message),
    },
    PLAYGROUND_PATTERN_INVALID: {
      message: ({ pattern }: { pattern: string }) =>
        `Invalid route pattern "${pattern}": write a route template that starts with "/" (such as "/admin/**"), ` +
        'a method and a template ("DELETE /users/:id"), or a method alone ("DELETE").',
      why: 'A pattern of `playground.exclude` is neither a route template, nor a method with a template, nor a method alone. A pattern that cannot be read would exclude nothing, so the plugin refuses to start with it.',
      fix: 'Write the pattern as `/admin/**`, `DELETE /users/:id` or `DELETE`. A template starts with `/`, `*` stands for one segment and `**` for any number of them.',
      // bare-error: a mistake in the plugin options, not an answer to a request
      create: (message) => new Error(message),
    },
    PLAYGROUND_EXCLUDE_INVALID: {
      message: ({ reason }: { reason: string }) => `[DevtoolsPlugin] playground.exclude: ${reason}`,
      why: 'One of the patterns in the `playground.exclude` option of `DevtoolsPlugin` could not be read. The message names the pattern and what is wrong with it.',
      fix: 'Correct the pattern in the `playground.exclude` option of `DevtoolsPlugin`: `/admin/**`, `DELETE /users/:id` or `DELETE`. Or set `playground: false` to turn the playground off.',
      // bare-error: a mistake in the plugin options, not an answer to a request
      create: (message) => new Error(message),
    },
  },
  { create: (message) => new NotFoundError(message) },
);
