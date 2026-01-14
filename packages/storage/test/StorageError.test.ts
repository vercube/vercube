import { describe, expect, it } from 'vitest';
import { StorageError } from '../src/Errors/StorageError';

describe('StorageError', () => {
  it('should create a StorageError with all properties', () => {
    const originalError = new Error('Original error');
    const metadata = { bucket: 'test-bucket', statusCode: 500 };
    
    const storageError = new StorageError(
      'Failed to perform operation',
      'testOperation',
      originalError,
      metadata,
    );

    expect(storageError).toBeInstanceOf(Error);
    expect(storageError).toBeInstanceOf(StorageError);
    expect(storageError.name).toBe('StorageError');
    expect(storageError.message).toBe('Failed to perform operation');
    expect(storageError.operation).toBe('testOperation');
    expect(storageError.cause).toBe(originalError);
    expect(storageError.metadata).toEqual(metadata);
  });

  it('should create a StorageError without cause', () => {
    const storageError = new StorageError(
      'Failed to perform operation',
      'testOperation',
    );

    expect(storageError.name).toBe('StorageError');
    expect(storageError.message).toBe('Failed to perform operation');
    expect(storageError.operation).toBe('testOperation');
    expect(storageError.cause).toBeUndefined();
    expect(storageError.metadata).toBeUndefined();
  });

  it('should create a StorageError without metadata', () => {
    const originalError = new Error('Original error');
    
    const storageError = new StorageError(
      'Failed to perform operation',
      'testOperation',
      originalError,
    );

    expect(storageError.name).toBe('StorageError');
    expect(storageError.cause).toBe(originalError);
    expect(storageError.metadata).toBeUndefined();
  });

  it('should have a stack trace', () => {
    const storageError = new StorageError(
      'Failed to perform operation',
      'testOperation',
    );

    expect(storageError.stack).toBeDefined();
    expect(typeof storageError.stack).toBe('string');
  });

  it('should capture stack trace in V8 environments', () => {
    // This test ensures the Error.captureStackTrace branch is covered
    const originalCaptureStackTrace = Error.captureStackTrace;
    
    // Ensure captureStackTrace exists (it does in V8/Node.js)
    if (Error.captureStackTrace) {
      const storageError = new StorageError(
        'Test error',
        'testOp',
      );
      
      expect(storageError.stack).toBeDefined();
    }
    
    // Restore original
    if (originalCaptureStackTrace) {
      Error.captureStackTrace = originalCaptureStackTrace;
    }
  });
});
