# Hooks

The Hooks system in Vercube provides a type-safe implementation of the observer pattern, allowing components to communicate through events without direct dependencies.

## Table of Contents

- [Overview](#overview)
- [Creating Hooks](#creating-hooks)
- [Using Hooks](#using-hooks)
  - [Triggering Hooks](#triggering-hooks)
  - [Listening to Hooks](#listening-to-hooks)
  - [One-time Listeners](#one-time-listeners)
  - [Removing Listeners](#removing-listeners)
- [The @Listen Decorator](#the-listen-decorator)
- [Best Practices](#best-practices)

## Overview

The Hooks system allows you to:

1. Define strongly-typed hooks with specific payload types
2. Trigger hooks from anywhere in your application
3. Listen for hooks and react to them
4. Use decorators to automatically register and unregister listeners

This pattern is particularly useful for:
- Decoupling components
- Implementing cross-cutting concerns
- Handling application lifecycle events
- Managing state changes

## Creating Hooks

Hooks are defined as simple classes that represent a specific event with its associated data. You don't need to implement constructors - the HooksService handles instantiation internally:

```typescript
// Define a hook class
class UserCreatedHook {
  public user: User;
}

// Define a hook with multiple properties
class OrderStatusChangedHook {
  public orderId: string;
  public oldStatus: OrderStatus;
  public newStatus: OrderStatus;
}
```

When triggering a hook, you provide the data as a plain object, and the HooksService will automatically map it to the hook class instance:

```typescript
// Trigger the hook with data
await this.hooksService.trigger(UserCreatedHook, { user: newUser });

// For a hook with multiple properties
await this.hooksService.trigger(OrderStatusChangedHook, { 
  orderId: '123', 
  oldStatus: 'pending', 
  newStatus: 'shipped' 
});
```

## Using Hooks

### Triggering Hooks

To trigger a hook, inject the HooksService and use its `trigger()` method:

```typescript
import { HooksService } from '@vercube/core';
import { Inject } from '@vercube/di';

class UserService {
  @Inject(HooksService)
  private hooksService: HooksService;

  async createUser(userData: UserData): Promise<User> {
    // Create user logic
    const user = await this.userRepository.create(userData);
    
    // Trigger the hook with the created user
    await this.hooksService.trigger(UserCreatedHook, { user });
    
    return user;
  }
}
```

The `trigger()` method:
- Takes the hook class and data as parameters
- Returns a Promise that resolves when all listeners have been notified
- Returns the number of listeners that were notified

### Listening to Hooks

To listen for a hook, inject the HooksService and use its `on()` method:

```typescript
import { HooksService } from '@vercube/core';
import { Inject } from '@vercube/di';

class NotificationService {
  @Inject(HooksService)
  private hooksService: HooksService;
  
  @Init()
  private init() {
    // Register a listener for the UserCreatedHook
    this.hooksService.on(UserCreatedHook, async (data) => {
      await this.sendWelcomeEmail(data.user);
    });
  }
  
  async sendWelcomeEmail(user: User): Promise<void> {
    // Email sending logic
  }
}
```

The `on()` method:
- Takes the hook class and a callback function
- Returns a `HookID` that can be used to remove the listener later

### One-time Listeners

To listen for a hook only once, inject the HooksService and use its `waitFor()` method:

```typescript
import { HooksService } from '@vercube/core';
import { Inject } from '@vercube/di';

class OrderService {
  @Inject(HooksService)
  private hooksService: HooksService;
  
  async processOrder(orderId: string): Promise<void> {
    // Start processing
    this.startProcessing(orderId);
    
    // Wait for the processing to complete
    try {
      const result = await this.hooksService.waitFor(OrderProcessedHook, 30000); // 30 second timeout
      console.log(`Order ${result.orderId} processed with status ${result.status}`);
    } catch (error) {
      console.error('Order processing timed out');
    }
  }
}
```

The `waitFor()` method:
- Takes the hook class and an optional timeout (in milliseconds)
- Returns a Promise that resolves with the hook data when the hook is triggered
- Rejects with an error if the timeout is reached

### Removing Listeners

To remove a listener, inject the HooksService and use its `off()` method:

```typescript
import { HooksService } from '@vercube/core';
import { Inject } from '@vercube/di';

class NotificationService {
  @Inject(HooksService)
  private hooksService: HooksService;
  
  private hookId: HooksTypes.HookID;
  
  @Init()
  private init() {
    // Register a listener and store the ID
    this.hookId = this.hooksService.on(UserCreatedHook, async (data) => {
      await this.sendWelcomeEmail(data.user);
    });
  }
  
  cleanup() {
    // Remove the listener when no longer needed
    this.hooksService.off(this.hookId);
  }
}
```

## The @Listen Decorator

The `@Listen` decorator provides a convenient way to register methods as hook listeners:

```typescript
import { Listen } from '@vercube/core';

class NotificationService {
  @Listen(UserCreatedHook)
  async onUserCreated(data: UserCreatedHook): Promise<void> {
    await this.sendWelcomeEmail(data.user);
  }
  
  @Listen(OrderStatusChangedHook)
  async onOrderStatusChanged(data: OrderStatusChangedHook): Promise<void> {
    if (data.newStatus === 'shipped') {
      await this.sendShippingNotification(data.orderId);
    }
  }
}
```

The `@Listen` decorator:
- Automatically registers the method as a listener for the specified hook
- Handles cleanup by unregistering the listener when the decorator is destroyed
- Provides type safety for the hook data

## Best Practices

1. **Dependency Injection**
   - Always inject the HooksService rather than using it directly
   - The HooksService is automatically bound to the application container
   - Use the `@Inject` decorator to inject the HooksService

2. **Hook Naming**
   - Use descriptive names that indicate what event occurred
   - Follow a consistent naming convention (e.g., `EntityActionHook`)
   - Include the word "Hook" in the class name for clarity

3. **Hook Data**
   - Keep hook data focused and relevant to the event
   - Include only the data needed by listeners
   - Use immutable data structures when possible

4. **Listener Implementation**
   - Keep listeners focused on a single responsibility
   - Handle errors appropriately
   - Use async/await for asynchronous operations

5. **Performance Considerations**
   - Avoid triggering hooks in tight loops
   - Remove listeners when they're no longer needed
   - Be mindful of the number of listeners for a single hook

6. **Testing**
   - Test hook triggering and listening separately
   - Use the `waitFor()` method in tests to wait for hooks
   - Mock the `HooksService` when testing components that use hooks

## See Also

- [Decorators](./decorators.md) - For more information about the `@Listen` decorator
- [Application](./application.md) - For information about application lifecycle hooks
