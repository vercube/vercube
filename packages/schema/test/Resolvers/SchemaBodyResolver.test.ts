import type { RouteConfig } from '@asteasolutions/zod-to-openapi';
import { describe, expect, it } from 'vitest';
import type { DeepPartial } from '@vercube/core';
import { SchemaBodyResolver } from '../../src/Resolvers/SchemaBodyResolver';
import { MetaMock } from '../Utils/Meta.mock';

describe('SchemaBodyResolver', () => {
  it('should resolve schema body correctly', () => {
    const schema: DeepPartial<RouteConfig> = {};
    SchemaBodyResolver(MetaMock, schema);

    expect(schema?.request?.body?.content?.['application/json']?.schema).toBeDefined();
  });
});
