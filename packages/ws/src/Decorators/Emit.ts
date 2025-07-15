import { initializeMetadata, initializeMetadataMethod } from '@vercube/core';
import { BaseDecorator, createDecorator } from '@vercube/di';

class EmitDecorator extends BaseDecorator {

  public override created(): void {
    initializeMetadata(this.prototype);
    const method = initializeMetadataMethod(this.prototype, this.propertyName);

    method.args.push({
      idx: this.propertyIndex,
      type: 'emit'
    });
  }

}

export function Emit(): Function {
  return createDecorator(EmitDecorator, undefined);
}