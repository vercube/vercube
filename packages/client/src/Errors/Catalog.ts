/**
 * The client runs in the browser and has no dependencies, so it carries its
 * own few lines of what `defineErrorCatalog()` of `@vercube/di` does: every
 * error gets a `code`, a `why`, a `fix` and a `link`, none of them enumerable.
 */

/** What a tool that lists the errors of the client reads. */
export interface ClientErrorDescription {
  code: string;
  message: string;
  why: string;
  fix: string;
  link: string;
}

/** Creates one error of the client. */
type ClientErrorFactory<P> = ((params: P) => TypeError) & Omit<ClientErrorDescription, 'message'>;

const PREFIX = 'VERCUBE_CLIENT';
const descriptions: ClientErrorDescription[] = [];

function define<P extends Record<string, string>>(
  key: string,
  message: (params: P) => string,
  why: string,
  fix: string,
): ClientErrorFactory<P> {
  const code = `${PREFIX}_${key}`;
  const guidance = { code, why, fix, link: `https://vercube.dev/docs/core-features/errors#${code.toLowerCase()}` };
  const descriptors: PropertyDescriptorMap = {};

  for (const [field, value] of Object.entries(guidance)) {
    descriptors[field] = { value, enumerable: false, writable: true, configurable: true };
  }

  const named = new Proxy({}, { get: (_target, name) => `<${String(name)}>` }) as P;

  descriptions.push({ ...guidance, message: message(named) });

  return Object.assign((params: P) => Object.defineProperties(new TypeError(message(params)), descriptors), guidance);
}

/**
 * The errors of `@vercube/client`. An error response of the server is not
 * one of them: that is a `VercubeClientError`, which mirrors what the server
 * answered.
 */
export const ClientErrors = {
  prefix: PREFIX,
  describe: (): ClientErrorDescription[] => descriptions.map((description) => ({ ...description })),
  MISSING_PATH_PARAMETER: define(
    'MISSING_PATH_PARAMETER',
    ({ name, path }: { name: string; path: string }) => `Missing path parameter "${name}" for ${path}`,
    'The route has a `:name` or `**:name` segment in its path, and the call gave no value for it, or gave `null` or `undefined`.',
    "Pass every segment of the path in `params`, for example `api.get('/users/:id', { params: { id } })`, and check that the value is defined before the call.",
  ),
  INVALID_PATH_PARAMETER: define(
    'INVALID_PATH_PARAMETER',
    ({ name, path }: { name: string; path: string }) => `Path parameter "${name}" cannot be "." or ".." in ${path}`,
    'A value in `params` is `.` or `..`, or a wildcard value has such a segment. A URL parser resolves these, so the request would reach another route than the one that was called.',
    'Reject or encode the value before the call. A value taken from user input must not be `.` or `..`, and a wildcard value must not contain `./` or `../` segments.',
  ),
} as const;
