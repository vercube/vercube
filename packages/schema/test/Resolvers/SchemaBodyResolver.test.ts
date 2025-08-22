import { describe, it, expect } from 'vitest';
import { MetaMock } from '../Utils/Meta.mock';
import { SchemaBodyResolver } from '../../src/Resolvers/SchemaBodyResolver';
import type { DeepPartial } from '@vercube/core';
import type { RouteConfig } from '@asteasolutions/zod-to-openapi';

describe('SchemaBodyResolver', () => {
  it('should resolve schema body correctly', () => {
    const schema: DeepPartial<RouteConfig> = {};
    SchemaBodyResolver(MetaMock, schema);

    expect(
      schema?.request?.body?.content?.['application/json']?.schema,
    ).toBeDefined();
  });
});
