import { describe, expect, it } from 'vitest';
import { SchemaQueryParamsResolver } from '../../src/Resolvers/SchemaQueryParamsResolver';
import { MetaMock } from '../Utils/Meta.mock';
import type { RouteConfig } from '@asteasolutions/zod-to-openapi';
import type { DeepPartial } from '@vercube/core';

describe('SchemaQueryParamsResolver', () => {
  it('should resolve schema query params correctly', () => {
    const schema: DeepPartial<RouteConfig> = {};
    SchemaQueryParamsResolver(MetaMock, schema);

    expect(schema?.request?.query).toBeDefined();
  });
});
