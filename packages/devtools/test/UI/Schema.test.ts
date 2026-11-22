import { describe, expect, it } from 'vitest';
import { checkSchema, coerceText, exampleOf, hintOf, propertiesOf, propertyOf } from '../../ui/src/playground/schema';
import type { JsonSchema } from '../../ui/src/playground/schema';

/**
 * The messages of a check, as `path message`.
 *
 * @param schema - The schema
 * @param value - The value
 * @returns One line per problem
 */
function problems(schema: JsonSchema, value: unknown): string[] {
  return checkSchema(schema, value).map((issue) => `${issue.path} ${issue.message}`.trim());
}

const order: JsonSchema = {
  type: 'object',
  required: ['sku', 'quantity'],
  additionalProperties: false,
  properties: {
    sku: { type: 'string', minLength: 3, pattern: '^[A-Z]' },
    quantity: { type: 'integer', minimum: 1, maximum: 10 },
    note: { type: ['string', 'null'], maxLength: 5 },
    email: { type: 'string', format: 'email' },
    tags: { type: 'array', items: { type: 'string' }, minItems: 1, maxItems: 2 },
    status: { enum: ['new', 'paid'] },
    kind: { const: 'order' },
    price: { type: 'number', exclusiveMinimum: 0, exclusiveMaximum: 100, multipleOf: 0.5 },
  },
};

describe('exampleOf', () => {
  it('writes out every declared property', () => {
    expect(exampleOf(order)).toEqual({
      sku: 'string',
      quantity: 1,
      note: 'strin',
      email: 'user@example.com',
      tags: ['string'],
      status: 'new',
      kind: 'order',
      price: 0.5,
    });
  });

  it('produces a value its own schema accepts, apart from patterns', () => {
    const { sku: _sku, ...rest } = (order as { properties: Record<string, unknown> }).properties;
    const schema = { ...(order as object), properties: rest, required: ['quantity'] };

    expect(checkSchema(schema, exampleOf(schema))).toEqual([]);
  });

  it('prefers examples and defaults', () => {
    expect(exampleOf({ type: 'string', examples: ['ada'] })).toBe('ada');
    expect(exampleOf({ type: 'string', example: 'grace' })).toBe('grace');
    expect(exampleOf({ type: 'number', default: 20 })).toBe(20);
  });

  it('respects string and number bounds', () => {
    expect(exampleOf({ type: 'string', minLength: 9 })).toBe('stringxxx');
    expect(exampleOf({ type: 'string', maxLength: 2 })).toBe('st');
    expect(exampleOf({ type: 'integer', exclusiveMinimum: 4 })).toBe(5);
    expect(exampleOf({ type: 'number', maximum: -3 })).toBe(-3);
    expect(exampleOf({ type: 'number', exclusiveMaximum: 0 })).toBeCloseTo(-0.1);
    expect(exampleOf({ type: 'integer', minimum: 1, multipleOf: 5 })).toBe(5);
    expect(exampleOf({ type: 'boolean' })).toBe(false);
    expect(exampleOf({ type: 'null' })).toBeNull();
    expect(exampleOf({ type: 'string', format: 'uuid' })).toBe('00000000-0000-4000-8000-000000000000');
  });

  it('picks the first alternative that is not null', () => {
    expect(exampleOf({ anyOf: [{ type: 'null' }, { type: 'integer', minimum: 3 }] })).toBe(3);
    expect(exampleOf({ oneOf: [{ type: 'null' }] })).toBeNull();
  });

  it('merges allOf objects', () => {
    expect(
      exampleOf({
        allOf: [
          { type: 'object', properties: { a: { type: 'string' } } },
          { type: 'object', properties: { b: { type: 'integer' } } },
        ],
      }),
    ).toEqual({ a: 'string', b: 0 });
    expect(exampleOf({ allOf: [{ type: 'string' }, { minLength: 2 }] })).toBe('string');
  });

  it('handles tuples, bare item lists and untyped objects', () => {
    expect(exampleOf({ type: 'array', prefixItems: [{ type: 'string' }, { type: 'integer' }] })).toEqual(['string', 0]);
    expect(exampleOf({ type: 'array' })).toEqual([]);
    expect(exampleOf({ properties: { a: { type: 'boolean' } } })).toEqual({ a: false });
    expect(exampleOf({})).toBeNull();
    expect(exampleOf(true)).toBeNull();
  });

  it('follows local references and ends recursive ones', () => {
    const tree: JsonSchema = {
      $ref: '#/$defs/Node',
      $defs: {
        Node: { type: 'object', properties: { name: { type: 'string' }, child: { $ref: '#/$defs/Node' } } },
      },
    };
    let node = exampleOf(tree) as { name: string; child: unknown } | null;
    let depth = 0;

    expect(node?.name).toBe('string');

    while (node && depth < 50) {
      node = node.child as typeof node;
      depth++;
    }

    expect(depth).toBeLessThan(20);
  });

  it('treats references it cannot follow as unconstrained', () => {
    expect(exampleOf({ $ref: 'https://example.com/schema.json' })).toBeNull();
    expect(exampleOf({ $ref: '#/$defs/Missing' })).toBeNull();
    expect(checkSchema({ $ref: 'https://example.com/schema.json' }, 12)).toEqual([]);
  });

  it('gives up on a reference that points at itself', () => {
    expect(exampleOf({ $ref: '#' })).toBeNull();
  });
});

describe('checkSchema', () => {
  it('accepts a value that fits', () => {
    expect(
      problems(order, { sku: 'ABC', quantity: 2, note: null, tags: ['a'], status: 'paid', kind: 'order', price: 1.5 }),
    ).toEqual([]);
  });

  it('reports missing, mistyped and unknown properties', () => {
    expect(problems(order, { sku: 12, extra: true })).toEqual([
      'quantity is required',
      'sku must be string, got integer',
      'extra is not a known property',
    ]);
  });

  it('reports string problems', () => {
    expect(problems(order, { sku: 'ab', quantity: 1, note: 'too long', email: 'nope' })).toEqual([
      'sku must have at least 3 characters',
      'sku must match ^[A-Z]',
      'note must have at most 5 characters',
      'email must be a valid email',
    ]);
    expect(problems({ type: 'string', minLength: 1 }, '')).toEqual(['must not be empty']);
  });

  it('reports number problems', () => {
    expect(problems(order, { sku: 'ABC', quantity: 0, price: 0 })).toEqual([
      'quantity must be at least 1',
      'price must be greater than 0',
    ]);
    expect(problems(order, { sku: 'ABC', quantity: 11, price: 100 })).toEqual([
      'quantity must be at most 10',
      'price must be less than 100',
    ]);
    expect(problems(order, { sku: 'ABC', quantity: 1.5, price: 0.7 })).toEqual([
      'quantity must be integer, got number',
      'price must be a multiple of 0.5',
    ]);
  });

  it('accepts a whole number where a number is asked for', () => {
    expect(problems({ type: 'number' }, 3)).toEqual([]);
  });

  it('reports array problems with the index', () => {
    expect(problems(order, { sku: 'ABC', quantity: 1, tags: [] })).toEqual(['tags must have at least 1 item']);
    expect(problems(order, { sku: 'ABC', quantity: 1, tags: ['a', 2, 'c'] })).toEqual([
      'tags must have at most 2 items',
      'tags[1] must be string, got integer',
    ]);
    expect(problems({ type: 'array', prefixItems: [{ type: 'string' }], items: { type: 'integer' } }, [1, 'x'])).toEqual([
      '[0] must be string, got integer',
      '[1] must be integer, got string',
    ]);
  });

  it('reports enum and const problems', () => {
    expect(problems(order, { sku: 'ABC', quantity: 1, status: 'lost', kind: 'cart' })).toEqual([
      'status must be one of "new", "paid"',
      'kind must be "order"',
    ]);
  });

  it('compares enum and const by value, whatever order the members were written in', () => {
    expect(problems({ const: { a: 1, b: 2 } }, { b: 2, a: 1 })).toEqual([]);
    expect(problems({ const: { a: 1, b: { c: [1, { d: 2, e: 3 }] } } }, { b: { c: [1, { e: 3, d: 2 }] }, a: 1 })).toEqual([]);
    expect(problems({ enum: [{ a: 1, b: 2 }, 'x'] }, { b: 2, a: 1 })).toEqual([]);
    expect(problems({ const: { a: 1, b: 2 } }, { a: 1, b: 3 })).toEqual(['must be {"a":1,"b":2}']);
    expect(problems({ const: { a: 1 } }, { a: 1, b: 2 })).toEqual(['must be {"a":1}']);
    expect(problems({ const: [1, 2] }, [2, 1])).toEqual(['must be [1,2]']);
    expect(problems({ const: [1, 2] }, { 0: 1, 1: 2 })).toEqual(['must be [1,2]']);
    expect(problems({ const: null }, null)).toEqual([]);
  });

  it('checks additional properties against their schema', () => {
    expect(problems({ type: 'object', additionalProperties: { type: 'integer' } }, { a: 1, b: 'x' })).toEqual([
      'b must be integer, got string',
    ]);
  });

  it('checks every part of allOf', () => {
    expect(problems({ allOf: [{ type: 'string' }, { minLength: 3 }] }, 'ab')).toEqual(['must have at least 3 characters']);
  });

  it('accepts a value that fits one alternative', () => {
    const schema = { anyOf: [{ type: 'string' }, { type: 'integer', minimum: 1 }] };

    expect(problems(schema, 'x')).toEqual([]);
    expect(problems(schema, 4)).toEqual([]);
    expect(problems(schema, 0)).toEqual(['matches none of the allowed shapes (closest: must be at least 1)']);
    expect(problems({ oneOf: [{ type: 'string', minLength: 2 }] }, 'a')).toEqual(['must have at least 2 characters']);
  });

  it('names the property in the closest alternative', () => {
    const schema = {
      anyOf: [
        { type: 'object', required: ['a'], properties: { a: { type: 'string' } } },
        { type: 'object', required: ['b', 'c'] },
      ],
    };

    expect(problems(schema, {})).toEqual(['matches none of the allowed shapes (closest: a is required)']);
  });

  it('understands the nullable flag and boolean schemas', () => {
    expect(problems({ type: 'string', nullable: true }, null)).toEqual([]);
    expect(problems(true, { anything: 1 })).toEqual([]);
    expect(problems(false, 1)).toEqual(['is not allowed']);
    expect(problems({ type: 'object', properties: { a: false } }, { a: 1 })).toEqual(['a is not allowed']);
  });

  it('ignores keywords and formats it does not know', () => {
    expect(problems({ type: 'string', format: 'made-up', contentEncoding: 'base64', 'x-vendor': 1 }, 'x')).toEqual([]);
    expect(problems({ type: 'string', pattern: '(' }, 'x')).toEqual([]);
    expect(problems({ type: 'number', multipleOf: 0 }, 3)).toEqual([]);
  });

  it('counts characters, not UTF-16 units', () => {
    expect(problems({ type: 'string', maxLength: 1 }, '😀')).toEqual([]);
  });

  it('follows references', () => {
    const schema = {
      type: 'object',
      properties: { owner: { $ref: '#/definitions/User' } },
      definitions: { User: { type: 'object', required: ['name'] } },
    };

    expect(problems(schema, { owner: {} })).toEqual(['owner.name is required']);
  });

  it('stops listing after fifty problems', () => {
    expect(
      checkSchema(
        { type: 'array', items: { type: 'string' } },
        Array.from({ length: 80 }, () => 1),
      ),
    ).toHaveLength(50);
  });

  it('checks what zod emits', () => {
    // The input schema zod 4 produces for an object with a non-empty string, a
    // non-negative integer, an optional email, an enum, a nullable object and
    // a coerced number, recorded here so devtools needs no validation library.
    const json: JsonSchema = {
      type: 'object',
      properties: {
        name: { type: 'string', minLength: 1 },
        age: { type: 'integer', minimum: 0, maximum: 9_007_199_254_740_991 },
        email: {
          type: 'string',
          format: 'email',
          pattern: String.raw`^(?:[A-Za-z0-9_'+\-]+\.)*[A-Za-z0-9_'+\-]*[A-Za-z0-9_+-]@(?:[A-Za-z0-9][A-Za-z0-9\-]*\.)+[A-Za-z]{2,}$`,
        },
        role: { type: 'string', enum: ['admin', 'user'] },
        address: {
          anyOf: [{ type: 'object', properties: { city: { type: 'string' } }, required: ['city'] }, { type: 'null' }],
        },
        limit: { type: 'number' },
      },
      required: ['name', 'age', 'role', 'address'],
    };

    expect(exampleOf(json)).toEqual({
      name: 'string',
      age: 0,
      email: 'user@example.com',
      role: 'admin',
      address: { city: 'string' },
      limit: 0,
    });
    expect(checkSchema(json, exampleOf(json))).toEqual([]);
    expect(problems(json, { name: '', age: -1, email: 'a@b', role: 'root', address: null })).toEqual([
      'name must not be empty',
      'age must be at least 0',
      String.raw`email must match ^(?:[A-Za-z0-9_'+\-]+\.)*[A-Za-z0-9_'+\-]*[A-Za-z0-9_+-]@(?:[A-Za-z0-9][A-Za-z0-9\-]*\.)+[A-Za-z]{2,}$`,
      'email must be a valid email',
      'role must be one of "admin", "user"',
    ]);
    expect(problems(json, { name: 'a', age: 1, role: 'user', address: { city: 1 } })).toEqual([
      'address matches none of the allowed shapes (closest: address.city must be string, got integer)',
    ]);
  });
});

describe('propertiesOf and propertyOf', () => {
  it('lists the declared properties with their required flag', () => {
    expect(propertiesOf(order).slice(0, 3)).toEqual([
      { name: 'sku', schema: { type: 'string', minLength: 3, pattern: '^[A-Z]' }, required: true },
      { name: 'quantity', schema: { type: 'integer', minimum: 1, maximum: 10 }, required: true },
      { name: 'note', schema: { type: ['string', 'null'], maxLength: 5 }, required: false },
    ]);
  });

  it('answers nothing for a schema without properties', () => {
    expect(propertiesOf(undefined)).toEqual([]);
    expect(propertiesOf({ type: 'string' })).toEqual([]);
    expect(propertiesOf(true)).toEqual([]);
  });

  it('reads one property, following references', () => {
    const schema = { properties: { owner: { $ref: '#/$defs/User' } }, $defs: { User: { type: 'object' } } };

    expect(propertyOf(schema, 'owner')).toEqual({ type: 'object' });
    expect(propertyOf(schema, 'missing')).toBeUndefined();
    expect(propertyOf(undefined, 'owner')).toBeUndefined();
  });
});

describe('checkSchema of values that are text on the wire', () => {
  /**
   * Checks a path, query or header value.
   *
   * @param schema - The schema
   * @param value - The text, or the texts of a repeated name
   * @returns One line per problem
   */
  function wire(schema: JsonSchema, value: unknown): string[] {
    return checkSchema(schema, value, { wire: true }).map((issue) => `${issue.path} ${issue.message}`.trim());
  }

  it('reads text as the number the schema asks for', () => {
    expect(wire({ type: 'integer', minimum: 1 }, '7')).toEqual([]);
    expect(wire({ type: 'number' }, '1.5')).toEqual([]);
    expect(wire({ type: 'integer', minimum: 1 }, '0')).toEqual(['must be at least 1']);
    expect(wire({ type: 'integer' }, 'abc')).toEqual(['must be integer, got string']);
  });

  it('reports nothing for a boolean: what text a coercion takes is not known here', () => {
    for (const text of ['true', 'false', 'yes', '1', 'on', '']) {
      expect(wire({ type: 'boolean' }, text)).toEqual([]);
    }
  });

  it('reads one value as a list of one', () => {
    const ids = { type: 'array', items: { type: 'number' } };

    expect(wire(ids, '1')).toEqual([]);
    expect(wire(ids, ['1', '2'])).toEqual([]);
    expect(wire(ids, ['1', 'x'])).toEqual(['[1] must be number, got string']);
    expect(wire({ ...ids, minItems: 2 }, '1')).toEqual(['must have at least 2 items']);
  });

  it('reads a repeated name as its first value where the schema takes no list', () => {
    expect(wire({ type: 'integer', maximum: 5 }, ['3', '9'])).toEqual([]);
    expect(wire({ type: 'integer', maximum: 5 }, ['9', '3'])).toEqual(['must be at most 5']);
    expect(wire({ type: 'string', minLength: 2 }, ['a', 'bcd'])).toEqual(['must have at least 2 characters']);
  });

  it('checks the members of an object the same way', () => {
    const query = {
      type: 'object',
      required: ['page'],
      properties: {
        page: { type: 'integer', minimum: 1 },
        ids: { type: 'array', items: { type: 'number' } },
        deep: { type: 'boolean' },
      },
    };

    expect(wire(query, { page: '2', ids: '1', deep: 'yes' })).toEqual([]);
    expect(wire(query, { page: '0', ids: ['1', '2'] })).toEqual(['page must be at least 1']);
    expect(wire(query, {})).toEqual(['page is required']);
  });

  it('matches enum and const against the text', () => {
    expect(wire({ enum: [1, 2] }, '2')).toEqual([]);
    expect(wire({ type: 'integer', enum: [1, 2] }, '2')).toEqual([]);
    expect(wire({ const: true }, 'true')).toEqual([]);
    expect(wire({ enum: ['asc', 'desc'] }, 'up')).toEqual(['must be one of "asc", "desc"']);
  });

  it('leaves an object or a null written as text to the server', () => {
    expect(wire({ type: 'object' }, '{"a":1}')).toEqual([]);
    expect(wire({ type: 'null' }, 'anything')).toEqual([]);
  });

  it('keeps checking strings as strings', () => {
    expect(wire({ type: 'string', minLength: 3 }, '12')).toEqual(['must have at least 3 characters']);
    expect(wire({ type: ['string', 'number'] }, '12')).toEqual([]);
    expect(wire({}, '12')).toEqual([]);
  });

  it('still reports a body value of the wrong type', () => {
    expect(checkSchema({ type: 'integer' }, '7')).toEqual([{ path: '', message: 'must be integer, got string' }]);
    expect(checkSchema({ type: 'array', items: { type: 'number' } }, '1')).toHaveLength(1);
  });
});

describe('coerceText', () => {
  it('leaves text alone without a schema or for a string schema', () => {
    expect(coerceText(undefined, '12')).toBe('12');
    expect(coerceText({ type: 'string' }, '12')).toBe('12');
    expect(coerceText({}, '12')).toBe('12');
    expect(coerceText({ type: ['string', 'number'] }, '12')).toBe('12');
  });

  it('reads numbers, booleans and null where the schema asks for them', () => {
    expect(coerceText({ type: 'integer' }, '12')).toBe(12);
    expect(coerceText({ type: 'number' }, '1.5')).toBe(1.5);
    expect(coerceText({ type: 'boolean' }, 'true')).toBe(true);
    expect(coerceText({ type: 'boolean' }, 'false')).toBe(false);
    expect(coerceText({ type: ['integer', 'null'] }, 'null')).toBeNull();
  });

  it('keeps text that is not what the schema asks for, so the check reports it', () => {
    expect(coerceText({ type: 'integer' }, 'abc')).toBe('abc');
    expect(coerceText({ type: 'integer' }, ' ')).toBe(' ');
    expect(coerceText({ type: 'boolean' }, 'yes')).toBe('yes');
  });
});

describe('hintOf', () => {
  it('describes what a field accepts', () => {
    expect(hintOf({ type: 'integer' })).toBe('integer');
    expect(hintOf({ type: 'string', format: 'email' })).toBe('string (email)');
    expect(hintOf({ type: ['string', 'null'] })).toBe('string');
    expect(hintOf({ enum: ['a', 'b'] })).toBe('a | b');
    expect(hintOf({})).toBe('');
    expect(hintOf(undefined)).toBe('');
  });
});
