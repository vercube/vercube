import type { StandardSchemaV1 } from '@standard-schema/spec';

export namespace ValidationTypes {

  export type Schema = StandardSchemaV1;

  export type Result<T = any> = StandardSchemaV1.Result<T>;

  export type Input<T extends Schema = Schema> = StandardSchemaV1.InferInput<T>;

}