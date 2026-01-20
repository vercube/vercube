import { describe, expect, it } from 'vitest';
import { SchemaBodyResolver } from '../../src/Resolvers/SchemaBodyResolver';
import { MetaMock } from '../Utils/Meta.mock';
import type { RouteConfig } from '@asteasolutions/zod-to-openapi';
import type { DeepPartial } from '@vercube/core';

describe('SchemaBodyResolver', () => {
  it('should resolve schema body correctly', () => {
    const schema: DeepPartial<RouteConfig> = {};
    SchemaBodyResolver(MetaMock, schema);

    expect(schema?.request?.body?.content?.['application/json']?.schema).toBeDefined();
  });
});
