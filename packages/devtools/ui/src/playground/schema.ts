/**
 * The JSON Schema subset the playground understands.
 *
 * Route descriptions carry the JSON Schema a validation library produced for a
 * handler argument. Two things are done with it: an example value is generated
 * to start the editor from, and a value is checked before it is sent. Both
 * cover what zod, valibot and arktype emit and ignore every keyword they do not
 * know.
 *
 * The checker is there to save a round trip, not to replace the server, so it
 * never reports a problem the server might not have: an unusual schema costs
 * precision instead. That matters most for path, query and header values.
 * They reach the server as text, and the schema describes them after the
 * validation library coerced them, so a text value is read the way a coercion
 * would read it (see {@link CheckOptions.wire}) and whatever cannot be decided
 * here is left to the server.
 */

/** A JSON Schema object, or the boolean shorthand. */
export type JsonSchema = Record<string, unknown> | boolean;

/** One problem found by {@link checkSchema}. */
export interface SchemaIssue {
  /** Where the problem is, such as `items[0].price`. Empty for the root. */
  path: string;
  message: string;
}

/** How a value is checked. */
export interface CheckOptions {
  /**
   * True for a path, query or header value, which is text on the wire. A
   * string is then accepted wherever a coercion could turn it into what the
   * schema asks for: a number written out, any text for a boolean, one value
   * for a list of them. A repeated query name arrives as a list, and stands
   * for its first value where the schema does not take a list, as core
   * resolves it.
   */
  wire?: boolean;
}

/** How deep examples and `$ref` chains are followed, which also ends recursive schemas. */
const MAX_DEPTH = 8;

/** Issues reported per check. Past this a list stops helping. */
const MAX_ISSUES = 50;

/** Example strings by `format`. */
const FORMAT_EXAMPLES: Record<string, string> = {
  email: 'user@example.com',
  uuid: '00000000-0000-4000-8000-000000000000',
  'date-time': '2026-01-01T00:00:00.000Z',
  date: '2026-01-01',
  time: '00:00:00',
  uri: 'https://example.com',
  url: 'https://example.com',
  hostname: 'example.com',
  ipv4: '127.0.0.1',
  ipv6: '::1',
};

/** Loose shape checks by `format`. A format not listed here is not checked. */
const FORMAT_CHECKS: Record<string, RegExp> = {
  email: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
  uuid: /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i,
  'date-time': /^\d{4}-\d{2}-\d{2}[Tt ]\d{2}:\d{2}(:\d{2}(\.\d+)?)?([Zz]|[+-]\d{2}:?\d{2})?$/,
  date: /^\d{4}-\d{2}-\d{2}$/,
  uri: /^[A-Za-z][\d+.A-Za-z-]*:\S+$/,
  url: /^[A-Za-z][\d+.A-Za-z-]*:\S+$/,
};

/**
 * Whether a value is a plain object.
 *
 * @param value - Any value
 * @returns True for objects that are not arrays or null
 */
function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Follows a local `$ref` (`#/$defs/Name`, `#/definitions/Name`, `#`).
 *
 * @param schema - Schema that may be a reference
 * @param root - Document the reference points into
 * @param depth - References followed so far
 * @returns The schema referred to, or the schema itself
 */
function resolve(schema: JsonSchema, root: JsonSchema, depth = 0): JsonSchema {
  if (!isObject(schema) || typeof schema.$ref !== 'string' || depth > MAX_DEPTH) {
    return schema;
  }

  const ref = schema.$ref;

  if (!ref.startsWith('#')) {
    // A remote reference cannot be fetched here, so it constrains nothing.
    return {};
  }

  let target: unknown = root;

  for (const part of ref.slice(1).split('/').filter(Boolean)) {
    target = isObject(target) ? target[part.replaceAll('~1', '/').replaceAll('~0', '~')] : undefined;
  }

  return isObject(target) || typeof target === 'boolean' ? resolve(target, root, depth + 1) : {};
}

/**
 * The types a schema allows, when it names any.
 *
 * @param schema - A resolved schema object
 * @returns The type names, or an empty list when the schema names none
 */
function typesOf(schema: Record<string, unknown>): string[] {
  const types = Array.isArray(schema.type) ? schema.type : [schema.type];
  const named = types.filter((type): type is string => typeof type === 'string');

  // OpenAPI 3.0 spells "or null" as a flag.
  return schema.nullable === true && named.length > 0 && !named.includes('null') ? [...named, 'null'] : named;
}

/**
 * The JSON type of a value.
 *
 * @param value - Any JSON value
 * @returns `null`, `array`, `integer`, `number`, `string`, `boolean` or `object`
 */
function typeOf(value: unknown): string {
  if (value === null) {
    return 'null';
  }

  if (Array.isArray(value)) {
    return 'array';
  }

  if (typeof value === 'number') {
    return Number.isInteger(value) ? 'integer' : 'number';
  }

  return typeof value;
}

/**
 * Whether two JSON values are the same value. Objects are compared by their
 * members, whatever order they were written in.
 *
 * @param left - A JSON value
 * @param right - A JSON value
 * @returns True when they are equal
 */
function sameValue(left: unknown, right: unknown): boolean {
  if (left === right) {
    return true;
  }

  if (Array.isArray(left) || Array.isArray(right)) {
    return (
      Array.isArray(left) &&
      Array.isArray(right) &&
      left.length === right.length &&
      left.every((item, index) => sameValue(item, right[index]))
    );
  }

  if (!isObject(left) || !isObject(right)) {
    return false;
  }

  const keys = Object.keys(left);

  return (
    keys.length === Object.keys(right).length &&
    keys.every((key) => Object.hasOwn(right, key) && sameValue(left[key], right[key]))
  );
}

/**
 * Whether a value equals a `const` or one option of an `enum`.
 *
 * @param expected - The value the schema names
 * @param value - The value being checked
 * @param wire - Whether the value is text on the wire
 * @returns True when they are equal, or when the text spells the expected number or boolean
 */
function matchesValue(expected: unknown, value: unknown, wire: boolean): boolean {
  return (
    sameValue(expected, value) ||
    (wire &&
      typeof value === 'string' &&
      (typeof expected === 'number' || typeof expected === 'boolean') &&
      String(expected) === value)
  );
}

/** Returned by {@link fromWire} for a value only the server can judge. */
const UNDECIDED = Symbol('undecided');

/**
 * Reads a value that is text on the wire the way the schema's coercion would.
 *
 * @param schema - A resolved schema object
 * @param value - A string, or the strings of a repeated query name
 * @returns The value to check, or {@link UNDECIDED} when no check here could be trusted
 */
function fromWire(schema: Record<string, unknown>, value: unknown): unknown {
  const types = typesOf(schema);

  if (types.length === 0) {
    return value;
  }

  if (Array.isArray(value)) {
    // Only a parameter declared as a list keeps every value; any other reads the first.
    return types.includes('array') ? value : fromWire(schema, value[0]);
  }

  if (typeof value !== 'string') {
    return value;
  }

  const coerced = coerceText(schema, value);

  if (typeof coerced !== 'string' || types.includes('string')) {
    return coerced;
  }

  if (types.includes('array')) {
    // One entry of a repeated name is a list of one.
    return [value];
  }

  // A boolean coercion takes any text, and how text becomes an object or a
  // null is the application's business. Text that is not a number is the one
  // case no coercion saves, so it goes on to be reported.
  return types.some((type) => type === 'boolean' || type === 'object' || type === 'null') ? UNDECIDED : value;
}

/**
 * Generates a value a schema accepts, to start an editor from.
 *
 * Declared examples and defaults win. Otherwise every declared property is
 * written out, optional ones included, because the point is to show the shape.
 *
 * @param schema - The schema
 * @param root - Document `$ref`s point into, the schema itself by default
 * @param depth - Nesting so far
 * @returns An example value
 */
export function exampleOf(schema: JsonSchema, root: JsonSchema = schema, depth = 0): unknown {
  const resolved = resolve(schema, root);

  if (!isObject(resolved) || depth > MAX_DEPTH) {
    return null;
  }

  if (resolved.const !== undefined) {
    return resolved.const;
  }

  if (Array.isArray(resolved.examples) && resolved.examples.length > 0) {
    return resolved.examples[0];
  }

  if (resolved.example !== undefined) {
    return resolved.example;
  }

  if (resolved.default !== undefined) {
    return resolved.default;
  }

  if (Array.isArray(resolved.enum) && resolved.enum.length > 0) {
    return resolved.enum[0];
  }

  for (const keyword of ['anyOf', 'oneOf'] as const) {
    const options = resolved[keyword];

    if (Array.isArray(options) && options.length > 0) {
      // "Something or null" should show the something.
      const preferred = options.find((option) => {
        const candidate = resolve(option as JsonSchema, root);

        return isObject(candidate) && !typesOf(candidate).includes('null');
      });

      return exampleOf((preferred ?? options[0]) as JsonSchema, root, depth + 1);
    }
  }

  if (Array.isArray(resolved.allOf) && resolved.allOf.length > 0) {
    const parts = resolved.allOf.map((part) => exampleOf(part as JsonSchema, root, depth + 1));

    return parts.every((part) => isObject(part)) ? Object.assign({}, ...(parts as object[])) : parts[0];
  }

  const type = typesOf(resolved).find((name) => name !== 'null') ?? (isObject(resolved.properties) ? 'object' : undefined);

  switch (type) {
    case 'object': {
      const result: Record<string, unknown> = {};

      for (const [key, property] of Object.entries(isObject(resolved.properties) ? resolved.properties : {})) {
        result[key] = exampleOf(property as JsonSchema, root, depth + 1);
      }

      return result;
    }
    case 'array': {
      if (Array.isArray(resolved.prefixItems)) {
        return resolved.prefixItems.map((item) => exampleOf(item as JsonSchema, root, depth + 1));
      }

      return resolved.items === undefined || resolved.items === false
        ? []
        : [exampleOf(resolved.items as JsonSchema, root, depth + 1)];
    }
    case 'string': {
      return exampleString(resolved);
    }
    case 'integer':
    case 'number': {
      return exampleNumber(resolved, type === 'integer');
    }
    case 'boolean': {
      return false;
    }
    default: {
      return null;
    }
  }
}

/**
 * An example for a string schema.
 *
 * @param schema - The schema
 * @returns A string that respects the format and the minimum length
 */
function exampleString(schema: Record<string, unknown>): string {
  const byFormat = typeof schema.format === 'string' ? FORMAT_EXAMPLES[schema.format] : undefined;

  if (byFormat) {
    return byFormat;
  }

  const min = typeof schema.minLength === 'number' ? schema.minLength : 0;
  const max = typeof schema.maxLength === 'number' ? schema.maxLength : Number.POSITIVE_INFINITY;
  const text = 'string'.padEnd(min, 'x');

  return text.length > max ? text.slice(0, Math.max(0, max)) : text;
}

/**
 * An example for a numeric schema.
 *
 * @param schema - The schema
 * @param integer - Whether the value must be whole
 * @returns A number inside the declared bounds
 */
function exampleNumber(schema: Record<string, unknown>, integer: boolean): number {
  const step = integer ? 1 : 0.1;
  let value = 0;

  if (typeof schema.minimum === 'number' && value < schema.minimum) {
    value = schema.minimum;
  }

  if (typeof schema.exclusiveMinimum === 'number' && value <= schema.exclusiveMinimum) {
    value = schema.exclusiveMinimum + step;
  }

  if (typeof schema.maximum === 'number' && value > schema.maximum) {
    value = schema.maximum;
  }

  if (typeof schema.exclusiveMaximum === 'number' && value >= schema.exclusiveMaximum) {
    value = schema.exclusiveMaximum - step;
  }

  if (typeof schema.multipleOf === 'number' && schema.multipleOf > 0) {
    value = Math.ceil(value / schema.multipleOf) * schema.multipleOf;
  }

  return integer ? Math.ceil(value) : value;
}

/**
 * Checks a value against a schema.
 *
 * @param schema - The schema
 * @param value - The value to check
 * @param options - Whether the value is text on the wire
 * @returns Every problem found, in document order; empty when the value fits
 */
export function checkSchema(schema: JsonSchema, value: unknown, options: CheckOptions = {}): SchemaIssue[] {
  const issues: SchemaIssue[] = [];

  check(schema, value, '', schema, issues, 0, options.wire === true);

  return issues;
}

/**
 * Joins a parent path and a property name.
 *
 * @param path - Path of the parent
 * @param key - Property name
 * @returns The path of the property
 */
function child(path: string, key: string): string {
  return path ? `${path}.${key}` : key;
}

/**
 * Checks one value, appending what is wrong with it.
 *
 * @param schema - Schema for this value
 * @param input - The value
 * @param path - Where the value sits
 * @param root - Document `$ref`s point into
 * @param issues - Collected problems
 * @param depth - Nesting so far
 * @param wire - Whether the value is text on the wire
 */
function check(
  schema: JsonSchema,
  input: unknown,
  path: string,
  root: JsonSchema,
  issues: SchemaIssue[],
  depth: number,
  wire: boolean,
): void {
  if (issues.length >= MAX_ISSUES || depth > MAX_DEPTH * 4) {
    return;
  }

  const resolved = resolve(schema, root);

  if (resolved === false) {
    issues.push({ path, message: 'is not allowed' });

    return;
  }

  if (!isObject(resolved)) {
    return;
  }

  const value = wire ? fromWire(resolved, input) : input;

  if (value === UNDECIDED) {
    return;
  }

  const actual = typeOf(value);
  const types = typesOf(resolved);

  if (types.length > 0 && !types.includes(actual) && !(actual === 'integer' && types.includes('number'))) {
    issues.push({ path, message: `must be ${types.join(' or ')}, got ${actual}` });

    return;
  }

  if (resolved.const !== undefined && !matchesValue(resolved.const, value, wire)) {
    issues.push({ path, message: `must be ${JSON.stringify(resolved.const)}` });
  }

  if (Array.isArray(resolved.enum) && !resolved.enum.some((option) => matchesValue(option, value, wire))) {
    issues.push({ path, message: `must be one of ${resolved.enum.map((option) => JSON.stringify(option)).join(', ')}` });
  }

  if (typeof value === 'string') {
    checkString(resolved, value, path, issues);
  } else if (typeof value === 'number') {
    checkNumber(resolved, value, path, issues);
  } else if (Array.isArray(value)) {
    checkArray(resolved, value, path, root, issues, depth, wire);
  } else if (isObject(value)) {
    checkObject(resolved, value, path, root, issues, depth, wire);
  }

  if (Array.isArray(resolved.allOf)) {
    for (const part of resolved.allOf) {
      check(part as JsonSchema, input, path, root, issues, depth + 1, wire);
    }
  }

  for (const keyword of ['anyOf', 'oneOf'] as const) {
    const options = resolved[keyword];

    if (!Array.isArray(options) || options.length === 0) {
      continue;
    }

    const attempts = options.map((option) => {
      const found: SchemaIssue[] = [];

      check(option as JsonSchema, input, path, root, found, depth + 1, wire);

      return found;
    });

    if (!attempts.some((found) => found.length === 0)) {
      // The closest alternative explains the mismatch better than "none matched".
      // An alternative of the wrong type altogether explains nothing, so one
      // of the right type is preferred whatever it found.
      let closest = attempts[0];

      for (const found of attempts) {
        if (distance(found, path) < distance(closest, path)) {
          closest = found;
        }
      }

      issues.push(...(options.length === 1 ? closest : [{ path, message: describeAlternatives(closest) }]));
    }
  }
}

/**
 * How far a value is from one alternative of an `anyOf`.
 *
 * @param found - Problems the alternative reported
 * @param path - Where the value sits
 * @returns The number of problems, pushed far back when the value has the wrong type
 */
function distance(found: SchemaIssue[], path: string): number {
  const wrongType = found.some((issue) => issue.path === path && issue.message.includes(', got '));

  return found.length + (wrongType ? MAX_ISSUES : 0);
}

/**
 * Words the failure of every alternative of an `anyOf`.
 *
 * @param closest - Problems of the alternative that came closest
 * @returns One message
 */
function describeAlternatives(closest: SchemaIssue[]): string {
  const first = closest[0];

  return first
    ? `matches none of the allowed shapes (closest: ${first.path ? `${first.path} ` : ''}${first.message})`
    : 'matches none of the allowed shapes';
}

/**
 * Checks the string keywords.
 *
 * @param schema - The schema
 * @param value - The string
 * @param path - Where the value sits
 * @param issues - Collected problems
 */
function checkString(schema: Record<string, unknown>, value: string, path: string, issues: SchemaIssue[]): void {
  // Length is counted in code points, as the specification does.
  const length = [...value].length;

  if (typeof schema.minLength === 'number' && length < schema.minLength) {
    issues.push({
      path,
      message: schema.minLength === 1 ? 'must not be empty' : `must have at least ${schema.minLength} characters`,
    });
  }

  if (typeof schema.maxLength === 'number' && length > schema.maxLength) {
    issues.push({ path, message: `must have at most ${schema.maxLength} characters` });
  }

  if (typeof schema.pattern === 'string') {
    let pattern: RegExp | null = null;

    try {
      pattern = new RegExp(schema.pattern, 'u');
    } catch {
      // A pattern this engine cannot compile is left to the server.
    }

    if (pattern && !pattern.test(value)) {
      issues.push({ path, message: `must match ${schema.pattern}` });
    }
  }

  const format = typeof schema.format === 'string' ? FORMAT_CHECKS[schema.format] : undefined;

  if (format && !format.test(value)) {
    issues.push({ path, message: `must be a valid ${String(schema.format)}` });
  }
}

/**
 * Checks the numeric keywords.
 *
 * @param schema - The schema
 * @param value - The number
 * @param path - Where the value sits
 * @param issues - Collected problems
 */
function checkNumber(schema: Record<string, unknown>, value: number, path: string, issues: SchemaIssue[]): void {
  if (typeof schema.minimum === 'number' && value < schema.minimum) {
    issues.push({ path, message: `must be at least ${schema.minimum}` });
  }

  if (typeof schema.maximum === 'number' && value > schema.maximum) {
    issues.push({ path, message: `must be at most ${schema.maximum}` });
  }

  if (typeof schema.exclusiveMinimum === 'number' && value <= schema.exclusiveMinimum) {
    issues.push({ path, message: `must be greater than ${schema.exclusiveMinimum}` });
  }

  if (typeof schema.exclusiveMaximum === 'number' && value >= schema.exclusiveMaximum) {
    issues.push({ path, message: `must be less than ${schema.exclusiveMaximum}` });
  }

  if (typeof schema.multipleOf === 'number' && schema.multipleOf > 0) {
    const ratio = value / schema.multipleOf;

    if (Math.abs(ratio - Math.round(ratio)) > 1e-9) {
      issues.push({ path, message: `must be a multiple of ${schema.multipleOf}` });
    }
  }
}

/**
 * Checks the array keywords.
 *
 * @param schema - The schema
 * @param value - The array
 * @param path - Where the value sits
 * @param root - Document `$ref`s point into
 * @param issues - Collected problems
 * @param depth - Nesting so far
 * @param wire - Whether the members are text on the wire
 */
function checkArray(
  schema: Record<string, unknown>,
  value: unknown[],
  path: string,
  root: JsonSchema,
  issues: SchemaIssue[],
  depth: number,
  wire: boolean,
): void {
  if (typeof schema.minItems === 'number' && value.length < schema.minItems) {
    issues.push({ path, message: `must have at least ${schema.minItems} item${schema.minItems === 1 ? '' : 's'}` });
  }

  if (typeof schema.maxItems === 'number' && value.length > schema.maxItems) {
    issues.push({ path, message: `must have at most ${schema.maxItems} item${schema.maxItems === 1 ? '' : 's'}` });
  }

  const prefix = Array.isArray(schema.prefixItems) ? schema.prefixItems : [];

  for (const [index, item] of value.entries()) {
    const itemSchema = index < prefix.length ? prefix[index] : schema.items;

    if (itemSchema !== undefined) {
      check(itemSchema as JsonSchema, item, `${path}[${index}]`, root, issues, depth + 1, wire);
    }
  }
}

/**
 * Checks the object keywords.
 *
 * @param schema - The schema
 * @param value - The object
 * @param path - Where the value sits
 * @param root - Document `$ref`s point into
 * @param issues - Collected problems
 * @param depth - Nesting so far
 * @param wire - Whether the members are text on the wire
 */
function checkObject(
  schema: Record<string, unknown>,
  value: Record<string, unknown>,
  path: string,
  root: JsonSchema,
  issues: SchemaIssue[],
  depth: number,
  wire: boolean,
): void {
  const properties = isObject(schema.properties) ? schema.properties : {};

  for (const key of Array.isArray(schema.required) ? schema.required : []) {
    if (typeof key === 'string' && value[key] === undefined) {
      issues.push({ path: child(path, key), message: 'is required' });
    }
  }

  for (const [key, entry] of Object.entries(value)) {
    if (key in properties) {
      check(properties[key] as JsonSchema, entry, child(path, key), root, issues, depth + 1, wire);
    } else if (schema.additionalProperties === false) {
      issues.push({ path: child(path, key), message: 'is not a known property' });
    } else if (isObject(schema.additionalProperties)) {
      check(schema.additionalProperties, entry, child(path, key), root, issues, depth + 1, wire);
    }
  }
}

/**
 * The schema of one property of an object schema.
 *
 * @param schema - An object schema
 * @param name - Property name
 * @returns The property schema, or undefined when it is not declared
 */
export function propertyOf(schema: JsonSchema | undefined, name: string): JsonSchema | undefined {
  const resolved = schema === undefined ? undefined : resolve(schema, schema);

  if (!isObject(resolved) || !isObject(resolved.properties) || !(name in resolved.properties)) {
    return undefined;
  }

  return resolve(resolved.properties[name] as JsonSchema, schema as JsonSchema);
}

/**
 * The declared properties of an object schema.
 *
 * @param schema - An object schema
 * @returns Each property with its schema and whether it is required
 */
export function propertiesOf(schema: JsonSchema | undefined): { name: string; schema: JsonSchema; required: boolean }[] {
  const resolved = schema === undefined ? undefined : resolve(schema, schema);

  if (!isObject(resolved) || !isObject(resolved.properties)) {
    return [];
  }

  const required = new Set(Array.isArray(resolved.required) ? resolved.required : []);

  return Object.keys(resolved.properties).map((name) => ({
    name,
    schema: resolve((resolved.properties as Record<string, JsonSchema>)[name], schema as JsonSchema),
    required: required.has(name),
  }));
}

/**
 * Reads text typed into a form field the way its schema expects.
 *
 * Path, query and header values are always text on the wire, and a schema
 * that says `number` is describing the value after the server coerced it.
 * Checking the raw text against it would report an error on every number.
 *
 * @param schema - Schema of the field, when it has one
 * @param text - The entered text
 * @returns The value to check: a number or a boolean when the schema asks for one and the text is one
 */
export function coerceText(schema: JsonSchema | undefined, text: string): unknown {
  if (!isObject(schema)) {
    return text;
  }

  const types = typesOf(schema);

  if (types.includes('string') || types.length === 0) {
    return text;
  }

  if ((types.includes('number') || types.includes('integer')) && text.trim() !== '' && Number.isFinite(Number(text))) {
    return Number(text);
  }

  if (types.includes('boolean') && (text === 'true' || text === 'false')) {
    return text === 'true';
  }

  if (types.includes('null') && text === 'null') {
    return null;
  }

  return text;
}

/**
 * A short description of what a field accepts, for a placeholder.
 *
 * @param schema - Schema of the field, when it has one
 * @returns Text such as `integer`, `string (email)` or `a | b`
 */
export function hintOf(schema: JsonSchema | undefined): string {
  if (!isObject(schema)) {
    return '';
  }

  if (Array.isArray(schema.enum)) {
    return schema.enum.map(String).join(' | ');
  }

  const types = typesOf(schema).filter((type) => type !== 'null');
  const format = typeof schema.format === 'string' ? ` (${schema.format})` : '';

  return types.length > 0 ? `${types.join(' | ')}${format}` : '';
}
