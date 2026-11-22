import { defineErrorCatalog } from '@vercube/di';
import { TestingError } from './TestingError';
import type { TestingTypes } from '../Types/TestingTypes';

/**
 * The errors of `@vercube/testing`. Every one is a {@link TestingError}, except
 * `CLOSE_FAILED`, which stays the `AggregateError` of the failures.
 */
export const TestingErrors = defineErrorCatalog(
  'VERCUBE_TESTING',
  {
    NOT_STUBBED: {
      message: ({ name, property }: { name: string; property: string }) =>
        `${name}.${property} is not stubbed. Add it to the object passed to stub() or to the override.`,
      why: 'The code under test called a member of a `stub()` that the test did not provide. A stub only has the members it was given, and throws for every other one so that a missing fake does not pass as `undefined`.',
      fix: 'Add the member to the object passed to `stub()`, or to the object in the `overrides` option of `createTestApp()` when `strictOverrides` is on.',
    },
    LOGS_DISABLED: {
      message: 'app.logs is not available: the app was created with `logger: false`.',
      why: '`createTestApp()` was called with `logger: false`, which keeps the logger of the configuration instead of the recording one, so there is nothing for `app.logs` to read.',
      fix: 'Remove `logger: false` from the options of `createTestApp()` in the tests that read `app.logs`.',
    },
    APP_CLOSED: {
      message: ({ method, url }: { method: string; url: string }) => `${method} ${url} was sent after app.close().`,
      why: 'A request was sent through a test app that is closing or closed. `app.close()` disposes the container, so the application can no longer answer.',
      fix: 'Send and await every request before `app.close()` runs, or before the `await using` block of the app ends. Call `createTestApp()` again when a test needs an app after closing one.',
    },
    IMPERSONATOR_MISSING: {
      message: '.as(user) needs an extension that authenticates users, such as testAuth() from @vercube/testing/auth.',
      why: '`.as(user)` hands the request to an extension that knows how to authenticate it, and the app was created without one.',
      fix: 'Pass the extension when creating the app: `createTestApp({ extensions: [testAuth()] })`, with `testAuth` imported from `@vercube/testing/auth`.',
    },
    OVERRIDE_AFTER_BOOT: {
      message:
        'Dependencies cannot be replaced once the app has booted: services already hold the original. Pass them in the `overrides` option of createTestApp() instead.',
      why: '`app.override()` was called on a booted test app. Services resolved their dependencies during boot, so a binding replaced now would not reach them.',
      fix: 'Pass the replacement to `createTestApp({ overrides: [[Token, fake]] })` so it is bound before the application initializes.',
    },
    BOOT_FAILED: {
      message: ({ phase, where, reason }: { phase: TestingTypes.BootPhase; where: string; reason: string; cause: unknown }) =>
        `createTestApp() failed during ${phase}${where}: ${reason}`,
      why: 'The application threw while `createTestApp()` was booting it. The message names the boot phase and ends with the message of the original error, which is kept as `cause`.',
      fix: 'Read `error.cause` for the original error and `error.phase` for the step that failed, then fix the `setup` callback, plugin, override or extension passed to `createTestApp()` that the phase points to.',
      create: (message, { phase, cause }) => new TestingError(message, { phase, cause }),
    },
    CLOSE_FAILED: {
      // the parameter is only there to hand the errors to the error
      message: (_params: { errors: unknown[] }) => 'Failed to close the test app',
      why: 'The application or an extension threw while `app.close()` was shutting the test app down. Everything else was still closed, and each failure is kept in `error.errors`.',
      fix: 'Read `error.errors` for the original errors, then fix the `@Destroy()` method, the plugin or the `teardown()` of the extension that threw.',
      create: (message, { errors }) => new AggregateError(errors, message),
    },
    TELEMETRY_NOT_SET_UP: {
      message: 'testTelemetry() is not set up yet: pass it to createTestApp({ extensions }) first.',
      why: 'The handle returned by `testTelemetry()` was read before an app set it up. The extension starts recording spans and metrics when `createTestApp()` runs it.',
      fix: 'Create the app with the extension before reading it: `const telemetry = testTelemetry(); await createTestApp({ extensions: [telemetry] })`.',
    },
    BODY_STREAMED: {
      message: 'The body was read as an event stream by events(), it cannot be read again.',
      why: 'A response body is a stream that can be consumed once. `events()` took it, so `bytes()`, `text()` and `json()` have nothing left to read.',
      fix: 'Read the response either with `events()` or with `json()`, `text()` or `bytes()`. Send the request again when the test needs both.',
    },
    BODY_NOT_JSON: {
      message: ({ method, url, contentType, excerpt }: JsonFailure) =>
        `Expected a JSON body from ${method} ${url}, got ${contentType}:\n${excerpt}`,
      why: '`json()` was called on a response whose body is not valid JSON. The message shows the content type and the start of the body the application sent.',
      fix: 'Return an object from the handler so the response is JSON, or read the body with `text()` or `bytes()` when the route answers with another format.',
      create: (message, { cause, request, response }) => new TestingError(message, { cause, request, response }),
    },
    BODY_ALREADY_READ: {
      message: 'The body was already read by json(), text() or bytes(), events() needs the unread stream.',
      why: '`events()` reads the response body as a stream, and the body was already consumed by `json()`, `text()` or `bytes()`.',
      fix: 'Call `events()` first and on its own. Send the request again when the test also needs the body as a whole.',
    },
    EVENTS_ALREADY_READ: {
      message: 'events() can only be called once per response.',
      why: '`events()` was called twice on one response. The first call took the body stream, so a second iteration would have nothing to read.',
      fix: 'Keep the iterable returned by the first `events()` call and loop over it once, or send the request again for a second stream.',
    },
    NO_EVENT_STREAM: {
      message: ({ method, url }: { method: string; url: string }) => `${method} ${url} returned no body to read events from.`,
      why: '`events()` was called on a response without a body, for example a 204 or a response to a HEAD request, so there is no event stream.',
      fix: "Check the status first with `.expect(200)`, and make sure the route returns an event stream, for example a handler decorated with `@Sse('/events')`.",
    },
    EXPECT_VALUE_MISSING: {
      message: ({ header }: { header: string }) => `expect("${header}") needs the expected value as its second argument.`,
      why: '`.expect()` was called with a header name only. A header expectation compares the header with a value, and none was given.',
      fix: 'Pass the value as a string or a regular expression: `.expect("content-type", /json/)`. Use `.expect(200)` to check a status.',
    },
    EXPECTATION_FAILED: {
      // a template, so the reference can render the parameter by its name
      message: ({ failure }: { failure: string } & Exchange) => `${failure}`,
      why: 'The response did not have the status or the header that `.expect()` asked for. The message shows the request that was sent and the response the application gave.',
      fix: 'Compare the exchange in the message, also available as `error.request` and `error.response`, with the expectation, then correct the handler or the value passed to `.expect()`.',
      create: (message, { request, response }) => new TestingError(message, { request, response }),
    },
  },
  { create: (message) => new TestingError(message) },
);

/** The request and the response a failure is about. */
interface Exchange {
  request: TestingTypes.RequestSnapshot;
  response: TestingTypes.ResponseSnapshot;
}

/** What `BODY_NOT_JSON` is created with. */
interface JsonFailure extends Exchange {
  method: string;
  url: string;
  contentType: string;
  /** The start of the body. Not named `body`: the reference would render it as an HTML tag. */
  excerpt: string;
  cause: unknown;
}
