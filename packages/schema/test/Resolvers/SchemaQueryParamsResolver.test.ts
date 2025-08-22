import { describe, it, expect } from "vitest";
import type { DeepPartial } from "@vercube/core";
import type { RouteConfig } from "@asteasolutions/zod-to-openapi";
import { MetaMock } from "../Utils/Meta.mock";
import { SchemaQueryParamsResolver } from "../../src/Resolvers/SchemaQueryParamsResolver";

describe('SchemaQueryParamsResolver', () => {

  it('should resolve schema query params correctly', () => {
    const schema: DeepPartial<RouteConfig> = {};
    SchemaQueryParamsResolver(MetaMock, schema);

    expect(schema?.request?.query).toBeDefined();
  });

});