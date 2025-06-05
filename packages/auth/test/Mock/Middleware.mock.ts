import { AuthProvider } from '@vercube/auth';

// Mock AuthProvider that returns an error
export class ErrorAuthProvider extends AuthProvider<unknown> {
  public async validate(request: Request, params: unknown): Promise<string | null> {
    return 'Authentication failed'; // Always returns an error
  }

  public async getCurrentUser(request: Request): Promise<{ id: number; name: string } | null> {
    return { id: 1, name: 'Test User' };
  }
}