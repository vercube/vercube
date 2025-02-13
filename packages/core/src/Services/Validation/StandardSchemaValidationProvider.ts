import { ValidationProvider } from './ValidationProvider';
import { ValidationTypes } from '../../Types/ValidationTypes';

/**
 * StandardSchemaValidationProvider implements validation using StandardSchema schema validation
 * @see https://github.com/standard-schema/standard-schema
 * @class
 * @implements {ValidationProvider}
 */
export class StandardSchemaValidationProvider implements ValidationProvider {

  /**
   * Validates data against a schema
   * @param {ValidationTypes.Schema} schema - The schema to validate against
   * @param {ValidationTypes.Input} data - The data to validate
   * @return {ValidationTypes.Result | Promise<ValidationTypes.Result>} The validation result
   */
  public validate(schema: ValidationTypes.Schema, data: ValidationTypes.Input): ValidationTypes.Result | Promise<ValidationTypes.Result> {
    return schema['~standard'].validate(data);
  }

}