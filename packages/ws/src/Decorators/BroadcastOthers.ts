// broadcast (emit) message to all users on the same namespace (excluding the peer)

import { initializeMetadata, initializeMetadataMethod } from '@vercube/core';
import { BaseDecorator, createDecorator } from '@vercube/di';

class BroadcastOthersDecorator extends BaseDecorator {

  public override created(): void {
    initializeMetadata(this.prototype);
    const method = initializeMetadataMethod(this.prototype, this.propertyName);

    method.args.push({
      idx: this.propertyIndex,
      type: 'broadcast_others'
    });
  }

}

export function BroadcastOthers(): Function {
  return createDecorator(BroadcastOthersDecorator, undefined);
}