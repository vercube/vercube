# Auth Implementations

The Auth module is designed to be extensible, allowing you to implement various authentication strategies by extending the `AuthProvider` abstract class. This document provides examples of common authentication implementations that you can use in your Vercube applications.

## Overview

While the Auth module itself doesn't include concrete implementations, it provides the foundation for creating authentication providers. Here are some common implementations that you might want to use:

- Basic Authentication
- JWT Authentication
- OAuth Authentication
- Session-based Authentication

## Basic Authentication

Basic Authentication is a simple authentication scheme built into the HTTP protocol. It sends credentials as a base64-encoded string in the Authorization header.

```typescript
import { AuthProvider } from '@vercube/auth';
import { AuthTypes } from '@vercube/auth';

interface BasicAuthUser {
  username: string;
  roles: string[];
}

export class BasicAuthenticationProvider extends AuthProvider<BasicAuthUser> {
  private users: Map<string, { password: string; roles: string[] }>;

  constructor() {
    super();
    // In a real application, you would load users from a database
    this.users = new Map([
      ['admin', { password: 'admin123', roles: ['admin'] }],
      ['user', { password: 'user123', roles: ['user'] }],
    ]);
  }

  public validate(request: Request, params?: AuthTypes.MiddlewareOptions): string | null {
    const [type, token] = (request.headers.get('Authorization') ?? '').split(' ');

    if (type !== 'Basic') {
      return 'Invalid authentication method';
    }

    try {
      const [username, password] = atob(token).split(':');
      const user = this.users.get(username);

      if (!user || user.password !== password) {
        return 'Invalid credentials';
      }

      // Check roles if specified
      if (params?.roles && params.roles.length > 0) {
        const hasRequiredRole = params.roles.some(role => 
          user.roles.includes(role)
        );
        
        if (!hasRequiredRole) {
          return 'Insufficient permissions';
        }
      }

      return null; // Authentication successful
    } catch (error) {
      return 'Invalid credentials format';
    }
  }

  public getCurrentUser(request: Request): BasicAuthUser | null {
    const [type, token] = (request.headers.get('Authorization') ?? '').split(' ');

    if (type !== 'Basic') {
      return null;
    }

    try {
      const [username] = atob(token).split(':');
      const user = this.users.get(username);

      if (!user) {
        return null;
      }

      return {
        username,
        roles: user.roles
      };
    } catch (error) {
      return null;
    }
  }
}
```

## JWT Authentication

JSON Web Tokens (JWT) are a compact, URL-safe means of representing claims between parties. They are commonly used for authentication and information exchange.

```typescript
import { AuthProvider } from '@vercube/auth';
import { AuthTypes } from '@vercube/auth';

interface JWTUser {
  id: number;
  username: string;
  roles: string[];
}

export class JWTAuthProvider extends AuthProvider<JWTUser> {
  private secret: string;

  constructor(secret: string) {
    super();
    this.secret = secret;
  }

  public validate(request: Request, params?: AuthTypes.MiddlewareOptions): string | null {
    const token = request.headers.get('Authorization')?.replace('Bearer ', '');
    
    if (!token) {
      return 'No token provided';
    }

    try {
      // In a real application, you would verify the JWT token
      const decoded = this.verifyToken(token);
      
      // Check roles if specified
      if (params?.roles && params.roles.length > 0) {
        const hasRequiredRole = params.roles.some(role => 
          decoded.roles.includes(role)
        );
        
        if (!hasRequiredRole) {
          return 'Insufficient permissions';
        }
      }
      
      return null; // Authentication successful
    } catch (error) {
      return 'Invalid token';
    }
  }

  public getCurrentUser(request: Request): JWTUser | null {
    const token = request.headers.get('Authorization')?.replace('Bearer ', '');
    
    if (!token) {
      return null;
    }

    try {
      // In a real application, you would decode the JWT token
      return this.verifyToken(token);
    } catch (error) {
      return null;
    }
  }

  private verifyToken(token: string): JWTUser {
    // In a real application, you would use a JWT library to verify the token
    // This is a simplified example
    return {
      id: 1,
      username: 'john.doe',
      roles: ['user']
    };
  }
}
```

## OAuth Authentication

OAuth is an open standard for access delegation, commonly used as a way for Internet users to grant websites or applications access to their information on other websites but without giving them the passwords.

```typescript
import { AuthProvider } from '@vercube/auth';
import { AuthTypes } from '@vercube/auth';

interface OAuthUser {
  id: string;
  provider: string;
  email: string;
  roles: string[];
}

export class OAuthAuthProvider extends AuthProvider<OAuthUser> {
  private clientId: string;
  private clientSecret: string;
  private redirectUri: string;

  constructor(clientId: string, clientSecret: string, redirectUri: string) {
    super();
    this.clientId = clientId;
    this.clientSecret = clientSecret;
    this.redirectUri = redirectUri;
  }

  public validate(request: Request, params?: AuthTypes.MiddlewareOptions): string | null {
    const token = request.headers.get('Authorization')?.replace('Bearer ', '');
    
    if (!token) {
      return 'No token provided';
    }

    try {
      // In a real application, you would verify the OAuth token
      const user = this.getUserFromToken(token);
      
      // Check roles if specified
      if (params?.roles && params.roles.length > 0) {
        const hasRequiredRole = params.roles.some(role => 
          user.roles.includes(role)
        );
        
        if (!hasRequiredRole) {
          return 'Insufficient permissions';
        }
      }
      
      return null; // Authentication successful
    } catch (error) {
      return 'Invalid token';
    }
  }

  public getCurrentUser(request: Request): OAuthUser | null {
    const token = request.headers.get('Authorization')?.replace('Bearer ', '');
    
    if (!token) {
      return null;
    }

    try {
      // In a real application, you would get the user from the OAuth token
      return this.getUserFromToken(token);
    } catch (error) {
      return null;
    }
  }

  private getUserFromToken(token: string): OAuthUser {
    // In a real application, you would use an OAuth library to get the user from the token
    // This is a simplified example
    return {
      id: '12345',
      provider: 'google',
      email: 'user@example.com',
      roles: ['user']
    };
  }
}
```

## Session-based Authentication

Session-based authentication uses server-side sessions to maintain user state. The client stores a session ID (usually in a cookie) that is sent with each request.

```typescript
import { AuthProvider } from '@vercube/auth';
import { AuthTypes } from '@vercube/auth';

interface SessionUser {
  id: number;
  username: string;
  roles: string[];
}

export class SessionAuthProvider extends AuthProvider<SessionUser> {
  private sessions: Map<string, SessionUser>;

  constructor() {
    super();
    // In a real application, you would use a session store like Redis
    this.sessions = new Map();
  }

  public validate(request: Request, params?: AuthTypes.MiddlewareOptions): string | null {
    const sessionId = request.headers.get('Cookie')?.match(/sessionId=([^;]+)/)?.[1];
    
    if (!sessionId) {
      return 'No session ID provided';
    }

    const user = this.sessions.get(sessionId);
    
    if (!user) {
      return 'Invalid session';
    }

    // Check roles if specified
    if (params?.roles && params.roles.length > 0) {
      const hasRequiredRole = params.roles.some(role => 
        user.roles.includes(role)
      );
      
      if (!hasRequiredRole) {
        return 'Insufficient permissions';
      }
    }
    
    return null; // Authentication successful
  }

  public getCurrentUser(request: Request): SessionUser | null {
    const sessionId = request.headers.get('Cookie')?.match(/sessionId=([^;]+)/)?.[1];
    
    if (!sessionId) {
      return null;
    }

    return this.sessions.get(sessionId) ?? null;
  }

  // Helper method to create a session (not part of the AuthProvider interface)
  public createSession(user: SessionUser): string {
    const sessionId = Math.random().toString(36).substring(2);
    this.sessions.set(sessionId, user);
    return sessionId;
  }
}
```

## Integration with Dependency Injection

To use your custom authentication provider with Vercube's dependency injection system, you need to bind it to the container:

```typescript
import { Container } from '@vercube/di';
import { BasicAuthenticationProvider } from './BasicAuthenticationProvider';
import { JWTAuthProvider } from './JWTAuthProvider';

export function useContainer(container: Container): Container {
  // Bind the authentication providers to the container
  container.bind(BasicAuthenticationProvider);
  container.bind(JWTAuthProvider);
  
  return container;
}
```

## See Also

- [Auth Provider](./auth-provider.md) - Documentation of the AuthProvider abstract class
- [Auth Decorator](./auth-decorator.md) - Documentation of the Auth decorator
- [User Decorator](./user-decorator.md) - Documentation of the User decorator
- [Auth Types](./auth-types.md) - Type definitions for authentication options 