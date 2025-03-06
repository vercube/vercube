/* eslint-disable @typescript-eslint/no-empty-object-type */
import { BaseDecorator, createDecorator, Inject } from '@vercube/di';
import { initializeMetadata, initializeMetadataMethod } from '../../Utils/Utils';
import { RuntimeConfig } from '../../Services/Config/RuntimeConfig';
import generateRandomHash from '../../Utils/InternalUtils';

/**
 * This class is responsible for managing session decorators.
 *
 * This class extends the BaseDecorator and is used to register session information
 * with the MetadataResolver. It ensures that the metadata for the property is created
 * and adds the session information to the metadata.
 *
 * @extends {BaseDecorator<{}>}
 */
class SessionDecorator extends BaseDecorator<{}> {

  @Inject(RuntimeConfig)
  private gRuntimeConfig: RuntimeConfig;

  /**
   * Called when the decorator is created.
   *
   * This method checks if metadata for the property exists, creates it if it doesn't,
   * and then adds the session information to the metadata.
   */
  public override created(): void {
    initializeMetadata(this.prototype);
    const method = initializeMetadataMethod(this.prototype, this.propertyName);

    method.args.push({
      idx: this.propertyIndex,
      type: 'session',
      data: {
        name: this.gRuntimeConfig.runtimeConfig.session?.name ?? 'vercube_session',
        secret: this.gRuntimeConfig.runtimeConfig.session?.secret?? generateRandomHash(),
        duration: this.gRuntimeConfig.runtimeConfig.session?.duration?? (60 * 60 * 24 * 7), // 7 days as default
      },
    });

  }

}

/**
 * A factory function for creating a SessionDecorator.
 *
 * This function returns a decorator function that can be used to annotate
 * a method parameter with session information.
 *
 * @return {Function} The decorator function.
 */
export function Session(): Function {
  return createDecorator(SessionDecorator, {});
}
