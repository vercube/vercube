import type { HttpStatusCode } from '@vercube/core';
import type { ZodMediaTypeObject } from '@asteasolutions/zod-to-openapi';

export namespace SchemaTypes {

  export interface Response {
    [key: HttpStatusCode | number]: ZodMediaTypeObject['schema'];
  }

}