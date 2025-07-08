/* eslint-disable @typescript-eslint/no-unused-vars */
import { Auth, User } from '../../src';
import { AuthProvider } from '../../src/Services/AuthProvider';

export class TestClass {

  @Auth()
  public testMethod() {}

}

@Auth({ roles: ['admin'] })
export class TestClass2 {}

@Auth()
export class TestClass3 {}

export class TestClass4 {

  @Auth()
  public testMethod() {}

}

@Auth()
export class TestClass5 {
  public testMethod(@User() user: any) {}
}

export class TestClass6 {
  public testMethod(@User({ provider: AuthProvider }) user: any) {}
}

// Mock AuthProvider for testing
export class MockAuthProvider extends AuthProvider {
  public async validate(request: Request, params: unknown): Promise<string | null> {
    return null; // Always valid for testing
  }

  public async getCurrentUser(request: Request): Promise<{ id: number; name: string } | null> {
    return { id: 1, name: 'Test User' };
  }
}

export class TestClass7 {
  // @ts-expect-error
  public testMethod(@User({ provider: MockAuthProvider }) user: any) {}
}
