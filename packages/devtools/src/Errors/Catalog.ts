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
  },
  { create: (message) => new NotFoundError(message) },
);
