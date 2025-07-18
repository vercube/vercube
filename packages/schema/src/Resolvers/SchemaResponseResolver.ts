// oxlint-disable no-array-reduce
import type { ResponseConfig, RouteConfig } from '@asteasolutions/zod-to-openapi';
import type { DeepPartial, HttpStatusCode } from '@vercube/core';
import { SchemaTypes } from '../Types/SchemaTypes';

export function SchemaResponseResolver(responses: SchemaTypes.Response | undefined, schema: DeepPartial<RouteConfig>): void {

  if (!responses) {
    return;
  }
  
  // build responses if exists
  schema.responses = Object.entries(responses).reduce((acc, [key, value]) => {
    acc[key as unknown as HttpStatusCode | number] = {
      description: '',
      content: { 'application/json': { schema: value } },
    };
    
    return acc;
  }, {} as Record<HttpStatusCode | number, ResponseConfig>);
}