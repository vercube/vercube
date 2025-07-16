import { BaseDecorator, createDecorator } from '@vercube/di';
import { initializeMetadata, initializeMetadataMethod } from '@vercube/core';
import { defu } from 'defu';
import type { MetadataTypes } from '@vercube/core';
import type { RouteConfig } from '@asteasolutions/zod-to-openapi'

// oxlint-disable-next-line no-empty-object-type
interface SchemaDecoratorOptions extends Omit<RouteConfig, 'method' | 'path'> {
};

class SchemaDecorator extends BaseDecorator<SchemaDecoratorOptions> {

  public override created(): void {
    initializeMetadata(this.prototype);
    initializeMetadataMethod(this.prototype, this.propertyName);
    
    // get method metadata object
    const _methodMeta = this.prototype.__metadata.__methods?.[this.propertyName] as MetadataTypes.Method;

    // set schema
    _methodMeta.meta.schema = defu(_methodMeta?.meta?.schema ?? {}, this.options);
  }

}

export function Schema(params: SchemaDecoratorOptions): Function {
  return createDecorator(SchemaDecorator, params);
}
