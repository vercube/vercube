import { checkSchema, coerceText, exampleOf, propertiesOf } from './schema';
import { buildTarget, pathParams } from './url';
import type { JsonSchema, SchemaIssue } from './schema';
import type { Pair, PathParam } from './url';
import type { IntrospectionTypes } from '@vercube/core';

/**
 * The request model of the route playground: what the form offers for a
 * route, the draft the user edits, and the request that draft turns into.
 *
 * Nothing here touches the network or the DOM. The view renders the model and
 * sends what {@link buildRequest} returns; the exports and the history work on
 * the same values, so what is shown, sent, copied and stored is one thing.
 */

/** Header that keeps the devtools cross-site rules working for playground requests. */
export const REQUEST_HEADER = 'x-devtools-request';

/** Header carrying the marker of a playground request. */
export const MARKER_HEADER = 'x-devtools-playground';

/** Header naming the request headers devtools must withhold, comma separated. */
export const REDACT_HEADER = 'x-devtools-playground-redact';

/** Methods that change state and are confirmed before they are sent. */
const WRITE_METHODS: ReadonlySet<string> = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/** Methods a body is offered for even when the handler declares none. */
const BODY_METHODS: ReadonlySet<string> = new Set(['POST', 'PUT', 'PATCH']);

/** How the body is written. */
export type BodyMode = 'none' | 'json' | 'text' | 'form';

/** One input the form offers because the handler reads it. */
export interface Field {
  name: string;
  required: boolean;
  /** Schema of the value, when the route description has one. */
  schema?: JsonSchema;
}

/** What the form offers for one route. */
export interface FormModel {
  /** Methods the route answers. More than one for a `GET` with its `HEAD` twin. */
  methods: string[];
  params: (PathParam & Field)[];
  /** Query entries the handler reads by name. */
  query: Field[];
  /** Headers the handler reads by name. */
  headers: Field[];
  /** Cookies the handler reads by name. */
  cookies: Field[];
  /** Schema of the whole query object, from `@QueryParams({ validationSchema })`. */
  querySchema?: JsonSchema;
  /** Schema of the body, from `@Body({ validationSchema })`. */
  bodySchema?: JsonSchema;
  /** Body mode the form starts in. */
  bodyMode: BodyMode;
}

/** The editable state of one request. */
export interface Draft {
  method: string;
  params: Record<string, string>;
  query: Pair[];
  headers: Pair[];
  cookies: Pair[];
  bodyMode: BodyMode;
  /** Body text of the `json` and `text` modes. */
  body: string;
  /** Fields of the `form` mode. */
  form: Pair[];
}

/** Credentials applied to a request. Kept apart from the draft so they are never stored with it. */
export interface Credentials {
  headers: Pair[];
  cookies: Pair[];
}

/** One header of a built request. */
export interface RequestHeader extends Pair {
  /** True for a credential, which exports leave out unless asked. */
  secret: boolean;
  /** True for the playground's own plumbing, which exports always leave out. */
  internal: boolean;
}

/** A request ready to send. */
export interface BuiltRequest {
  method: string;
  /** Path and query, relative to the origin. */
  target: string;
  headers: RequestHeader[];
  /** Cookies to set for the duration of the request; `fetch` cannot send a `Cookie` header. */
  cookies: (Pair & { secret: boolean })[];
  body: { kind: 'none' } | { kind: 'text'; text: string } | { kind: 'form'; fields: Pair[] };
}

/**
 * Describes the form for a route.
 *
 * @param route - The route description
 * @returns What the playground offers for it
 */
export function describeForm(route: IntrospectionTypes.RouteDescription): FormModel {
  const args = route.args as (IntrospectionTypes.RouteArg & { schema?: JsonSchema })[];
  const methods = route.method.split(' / ');

  /**
   * Collects the named arguments of one decorator kind.
   *
   * @param type - Decorator kind
   * @returns One field per distinct name
   */
  const named = (type: string): Field[] => {
    const fields = new Map<string, Field>();

    for (const arg of args) {
      if (arg.type === type && arg.name && !fields.has(arg.name)) {
        fields.set(arg.name, { name: arg.name, required: false, schema: arg.schema });
      }
    }

    return [...fields.values()];
  };

  const paramSchemas = new Map(named('param').map((field) => [field.name, field.schema]));
  const querySchema = args.find((arg) => arg.type === 'query-params' && arg.schema)?.schema;
  const query = new Map(named('query-param').map((field) => [field.name, field]));

  // The schema of the whole query object names entries the handler never asks
  // for one by one, and says which of them are required.
  for (const property of propertiesOf(querySchema)) {
    query.set(property.name, { ...query.get(property.name), ...property });
  }

  const body = args.find((arg) => arg.type === 'body');
  const multipart = args.some((arg) => arg.type === 'multipart-form-data');
  const takesBody = Boolean(body) || multipart || methods.some((method) => BODY_METHODS.has(method));

  const jsonOrNone: BodyMode = takesBody ? 'json' : 'none';

  return {
    methods,
    params: pathParams(route.path).map((param) => ({ ...param, required: true, schema: paramSchemas.get(param.name) })),
    query: [...query.values()],
    headers: named('header'),
    cookies: named('cookie'),
    querySchema,
    bodySchema: body?.schema,
    bodyMode: multipart ? 'form' : jsonOrNone,
  };
}

/**
 * The draft a route starts from: every known field present and empty, and the
 * body an example generated from its schema.
 *
 * @param model - The form model
 * @returns A fresh draft
 */
export function createDraft(model: FormModel): Draft {
  return {
    method: model.methods[0],
    params: Object.fromEntries(model.params.map((param) => [param.name, ''])),
    query: model.query.map((field) => ({ name: field.name, value: '' })),
    headers: model.headers.map((field) => ({ name: field.name, value: '' })),
    cookies: model.cookies.map((field) => ({ name: field.name, value: '' })),
    bodyMode: model.bodyMode,
    body: model.bodySchema === undefined ? '' : JSON.stringify(exampleOf(model.bodySchema), null, 2),
    form: [],
  };
}

/**
 * Whether a method is confirmed before it is sent.
 *
 * @param method - HTTP method
 * @returns True for `POST`, `PUT`, `PATCH` and `DELETE`
 */
export function needsConfirmation(method: string): boolean {
  return WRITE_METHODS.has(method.toUpperCase());
}

/**
 * Checks a draft against what the route declares.
 *
 * @param draft - The draft
 * @param model - The form model
 * @returns Problems by form section, each empty when there are none
 */
export function validateDraft(
  draft: Draft,
  model: FormModel,
): { params: SchemaIssue[]; query: SchemaIssue[]; body: SchemaIssue[] } {
  const params: SchemaIssue[] = [];

  for (const param of model.params) {
    const value = draft.params[param.name] ?? '';

    if (value === '') {
      params.push({ path: param.name, message: 'is required' });
    } else if (param.schema !== undefined) {
      params.push(...checkSchema(param.schema, coerceText(param.schema, value)).map((issue) => ({ ...issue, path: param.name })));
    }
  }

  return { params, query: validateQuery(draft, model), body: validateBody(draft, model) };
}

/**
 * Checks the query entries.
 *
 * @param draft - The draft
 * @param model - The form model
 * @returns The problems found
 */
function validateQuery(draft: Draft, model: FormModel): SchemaIssue[] {
  const entered: Record<string, unknown> = {};

  for (const { name, value } of draft.query) {
    if (!name.trim() || value === '') {
      continue;
    }

    const coerced = coerceText(model.query.find((field) => field.name === name.trim())?.schema, value);
    const previous = entered[name.trim()];

    // A repeated name is how a list is written in a query string.
    entered[name.trim()] = previous === undefined ? coerced : [...(Array.isArray(previous) ? previous : [previous]), coerced];
  }

  if (model.querySchema !== undefined) {
    return checkSchema(model.querySchema, entered);
  }

  return model.query.flatMap((field) =>
    field.schema !== undefined && entered[field.name] !== undefined
      ? checkSchema(field.schema, entered[field.name]).map((issue) => ({ ...issue, path: field.name }))
      : [],
  );
}

/**
 * Checks the body.
 *
 * @param draft - The draft
 * @param model - The form model
 * @returns The problems found
 */
function validateBody(draft: Draft, model: FormModel): SchemaIssue[] {
  if (draft.bodyMode !== 'json' || draft.body.trim() === '') {
    return draft.bodyMode === 'json' && model.bodySchema !== undefined ? [{ path: '', message: 'is required' }] : [];
  }

  let parsed: unknown;

  try {
    parsed = JSON.parse(draft.body);
  } catch (error) {
    return [{ path: '', message: `is not valid JSON: ${error instanceof Error ? error.message : String(error)}` }];
  }

  return model.bodySchema === undefined ? [] : checkSchema(model.bodySchema, parsed);
}

/**
 * Turns a draft into the request to send.
 *
 * @param route - The route description
 * @param draft - The draft
 * @param options - The marker of this request, and the credentials to apply
 * @returns The request, and the path placeholders left unfilled
 */
export function buildRequest(
  route: Pick<IntrospectionTypes.RouteDescription, 'path'>,
  draft: Draft,
  options: { marker?: { id: string; traceparent: string }; credentials?: Credentials } = {},
): { request: BuiltRequest; missing: string[] } {
  const { path: target, missing } = buildTarget(route.path, draft.params, draft.query);
  const headers: RequestHeader[] = [];
  const taken = new Set<string>();

  /**
   * Adds a header unless one with that name is already set.
   *
   * @param name - Header name
   * @param value - Header value
   * @param flags - Whether the header is a credential or plumbing
   */
  const add = (name: string, value: string, flags: { secret?: boolean; internal?: boolean } = {}): void => {
    const key = name.trim().toLowerCase();

    if (!key || taken.has(key)) {
      return;
    }

    taken.add(key);
    headers.push({ name: name.trim(), value, secret: flags.secret === true, internal: flags.internal === true });
  };

  // What the user typed wins over what the playground would add.
  for (const { name, value } of draft.headers) {
    if (value !== '') {
      add(name, value);
    }
  }

  for (const { name, value } of options.credentials?.headers ?? []) {
    add(name, value, { secret: true });
  }

  let body: BuiltRequest['body'] = { kind: 'none' };

  if (draft.method !== 'GET' && draft.method !== 'HEAD') {
    if (draft.bodyMode === 'form') {
      // No content type: the browser writes it, with the multipart boundary.
      body = { kind: 'form', fields: draft.form.filter((field) => field.name.trim()) };
    } else if (draft.bodyMode !== 'none' && draft.body !== '') {
      body = { kind: 'text', text: draft.body };
      add('Content-Type', draft.bodyMode === 'json' ? 'application/json' : 'text/plain');
    }
  }

  add('Accept', 'application/json, text/plain, */*');

  if (options.marker) {
    const secrets = headers.filter((header) => header.secret).map((header) => header.name.toLowerCase());

    add(REQUEST_HEADER, '1', { internal: true });
    add(MARKER_HEADER, options.marker.id, { internal: true });
    add('traceparent', options.marker.traceparent, { internal: true });

    if (secrets.length > 0) {
      add(REDACT_HEADER, secrets.join(','), { internal: true });
    }
  }

  return {
    request: {
      method: draft.method,
      target,
      headers,
      cookies: [
        ...draft.cookies
          .filter((cookie) => cookie.name.trim() && cookie.value !== '')
          .map((cookie) => ({ ...cookie, secret: false })),
        ...(options.credentials?.cookies ?? []).map((cookie) => ({ ...cookie, secret: true })),
      ],
      body,
    },
    missing,
  };
}
