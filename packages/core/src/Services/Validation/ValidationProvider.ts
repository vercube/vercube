import { ValidationTypes } from '../../Types/ValidationTypes';

/**
 * Abstract class representing a validation provider
 * Provides a common interface for different validation implementations
 *
 * @abstract
 * @class ValidationProvider
 */

export abstract class ValidationProvider {
  /**
   * Validates data against a given schema
   * @param schema - The validation schema to check against
   * @param data - The data to validate
   * @returns A validation result object or Promise of validation result
   */
  public abstract validate(
    schema: ValidationTypes.Schema,
    data: ValidationTypes.Input,
  ): ValidationTypes.Result | Promise<ValidationTypes.Result>;
}
