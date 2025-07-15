// broadcast (emit) message to all users on the same namespace (including the peer)

import { initializeMetadata, initializeMetadataMethod } from '@vercube/core';
import { BaseDecorator, createDecorator } from '@vercube/di';

class BroadcastDecorator extends BaseDecorator {

  public override created(): void {
    initializeMetadata(this.prototype);
    const method = initializeMetadataMethod(this.prototype, this.propertyName);

    method.args.push({
      idx: this.propertyIndex,
      type: 'broadcast'
    });
  }

}

export function Broadcast(): Function {
  return createDecorator(BroadcastDecorator, undefined);
}