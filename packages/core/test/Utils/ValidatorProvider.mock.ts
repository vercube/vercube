// oxlint-disable no-unused-vars
import { ValidationProvider } from '../../src/Services/Validation/ValidationProvider';

export class ValidatorProviderMock extends ValidationProvider {
  public async validate(schema: any, data: any): Promise<any> {
    return {
      issues: [],
    };
  }
}

export class ValidatorWithIssuesProvider extends ValidationProvider {
  public async validate(schema: any, data: any): Promise<any> {
    return {
      issues: ['test'],
    };
  }
}
