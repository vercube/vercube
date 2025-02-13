import { BaseDecorator, createDecorator, Inject } from '@vercube/di';
import { MetadataResolver } from '../../Services/Metadata/MetadataResolver';
import { MetadataTypes } from '../../Types/MetadataTypes';

interface QueryDecoratorOptions {
  name: string;
}

/**
 * This class is responsible for managing query parameter decorators.
 *
 * This class extends the BaseDecorator and is used to register query parameter information
 * with the MetadataResolver. It ensures that the metadata for the property is created
 * and adds the query parameter information to the metadata.
 *
 * @extends {BaseDecorator<QueryDecoratorOptions>}
 */
class QueryDecorator extends BaseDecorator<QueryDecoratorOptions, MetadataTypes.Metadata> {

  @Inject(MetadataResolver)
  private gMetadataResolver!: MetadataResolver;

  /**
   * Called when the decorator is created.
   *
   * This method checks if metadata for the property exists, creates it if it doesn't,
   * and then adds the query parameter information to the metadata.
   */
  public override created(): void {
    if (!this.prototype.__metadata?.__methods) {
      this.prototype.__metadata.__methods = {};
    }

    // if metadata for property does not exist, create it
    if (!this.prototype.__metadata?.__methods[this.propertyName]) {
      this.prototype.__metadata.__methods[this.propertyName] = this.gMetadataResolver.create();
    }

    // add query parameter to metadata
    this.prototype.__metadata.__methods[this.propertyName].args.push({
      idx: this.propertyIndex,
      type: 'query',
      data: {
        name: this.options.name,
      },
    });

  }

}

/**
 * A factory function for creating a QueryDecorator.
 *
 * This function returns a decorator function that can be used to annotate
 * a method parameter with query parameter information.
 *
 * @param {string} name - The name of the query parameter.
 * @return {Function} The decorator function.
 */
export function Query(name: string): Function {
  return createDecorator(QueryDecorator, { name });
}