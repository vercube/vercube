import { BadRequestError } from '@vercube/core';
import { defineErrorCatalog } from '@vercube/di';

/**
 * The errors of `@vercube/ws`.
 */
export const WsErrors = defineErrorCatalog('VERCUBE_WS', {
  SCHEMA_WITHOUT_VALIDATION_PROVIDER: {
    message: ({ event, namespace }: { event: string; namespace: string }) =>
      `Message handler for event "${event}" in namespace "${namespace}" has a validationSchema, but no ValidationProvider is registered.`,
    why: 'A `@Message()` handler declares a `validationSchema`, and the container has no `ValidationProvider` to check messages with. `createApp()` binds one, so the container was built by hand or the binding was removed. Every message of the event would be dropped, so the application fails at boot instead.',
    fix: 'Bind a provider before the controllers are registered: `container.bind(ValidationProvider, StandardSchemaValidationProvider)`, both from `@vercube/core`. Or remove `validationSchema` from the `@Message()` options.',
  },
  VALIDATION_PROVIDER_MISSING: {
    message: 'ValidationProvider is not registered',
    why: 'A message arrived for a handler that has a `validationSchema`, and the websocket service has no `ValidationProvider` to check it with. The message is not handled.',
    fix: 'Bind a provider in the container the websocket service is resolved from: `container.bind(ValidationProvider, StandardSchemaValidationProvider)`, both from `@vercube/core`.',
  },
  MESSAGE_INVALID: {
    // the parameter is only there to hand the issues to the error
    message: (_params: { issues: unknown }) => 'Websocket message validation error',
    why: 'The `data` of a websocket message does not match the `validationSchema` of the `@Message()` handler for its event. The peer receives an `error` frame with the issues.',
    fix: 'Send `data` that matches the schema of the event. The `issues` of the `error` frame name each field that failed.',
    create: (message, { issues }) => new BadRequestError(message, issues),
  },
});
