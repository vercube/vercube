import { Readable } from 'node:stream';
import { DeleteObjectCommand, ListObjectsV2Command, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { S3Storage } from '../src/Drivers/S3Storage';

function ReadableFromString(str: string): Readable {
  const stream = new Readable();
  stream.push(str);
  stream.push(null);
  return stream;
}

describe('S3Storage', () => {
  let storage: S3Storage;
  let mockSend: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    mockSend = vi.fn();
    vi.spyOn(S3Client.prototype, 'send').mockImplementation(mockSend as any);

    storage = new S3Storage();
    await storage.initialize({
      region: 'us-east-1',
      bucket: 'test-bucket',
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('setItem', () => {
    it('should send PutObjectCommand with correct params', async () => {
      mockSend.mockResolvedValueOnce({});
      await storage.setItem('key', { test: 'value' });

      expect(mockSend).toHaveBeenCalledWith(expect.any(PutObjectCommand));
      const cmd = mockSend.mock.calls[0][0] as PutObjectCommand;
      expect(cmd.input.Bucket).toBe('test-bucket');
      expect(cmd.input.Key).toBe('key');
      expect(cmd.input.Body).toBe(JSON.stringify({ test: 'value' }));
    });
  });

  describe('getItem', () => {
    it('should return parsed value when item exists', async () => {
      const mockStream = ReadableFromString(JSON.stringify({ test: 'value' }));
      mockSend.mockResolvedValueOnce({ Body: mockStream });

      const result = await storage.getItem<{ test: string }>('key');
      expect(result).toEqual({ test: 'value' });
    });

    it('should return undefined if NoSuchKey error', async () => {
      mockSend.mockRejectedValueOnce({ name: 'NoSuchKey' });
      const result = await storage.getItem('missing');
      expect(result).toBeUndefined();
    });

    it('should throw StorageError for other errors', async () => {
      const mockError = { 
        name: 'AccessDenied',
        message: 'Access Denied',
        $metadata: { httpStatusCode: 403 }
      };
      mockSend.mockRejectedValueOnce(mockError);
      
      await expect(storage.getItem('key')).rejects.toMatchObject({
        name: 'StorageError',
        operation: 'getItem',
        message: expect.stringContaining('AccessDenied'),
      });
    });
  });

  describe('deleteItem', () => {
    it('should send DeleteObjectCommand', async () => {
      mockSend.mockResolvedValueOnce({});
      await storage.deleteItem('key');
      expect(mockSend).toHaveBeenCalledWith(expect.any(DeleteObjectCommand));
      const cmd = mockSend.mock.calls[0][0] as DeleteObjectCommand;
      expect(cmd.input.Key).toBe('key');
    });
  });

  describe('hasItem', () => {
    it('should return true if GetObjectCommand succeeds', async () => {
      mockSend.mockResolvedValueOnce({});
      const result = await storage.hasItem('key');
      expect(result).toBe(true);
    });

    it('should return false if NoSuchKey error', async () => {
      mockSend.mockRejectedValueOnce({ name: 'NoSuchKey' });
      const result = await storage.hasItem('missing');
      expect(result).toBe(false);
    });

    it('should throw StorageError on other errors', async () => {
      const mockError = {
        name: 'ServiceUnavailable',
        message: 'Service Unavailable',
        $metadata: { httpStatusCode: 503 }
      };
      mockSend.mockRejectedValueOnce(mockError);
      
      await expect(storage.hasItem('key')).rejects.toMatchObject({
        name: 'StorageError',
        operation: 'hasItem',
        message: expect.stringContaining('ServiceUnavailable'),
      });
    });
  });

  describe('getKeys', () => {
    it('should accumulate keys across paginated results', async () => {
      mockSend
        .mockResolvedValueOnce({
          Contents: [{ Key: 'a' }, { Key: 'b' }],
          NextContinuationToken: 'token1',
        })
        .mockResolvedValueOnce({
          Contents: [{ Key: 'c' }],
          NextContinuationToken: undefined,
        });

      const keys = await storage.getKeys();
      expect(keys).toEqual(['a', 'b', 'c']);
    });

    it('should return empty array if no objects', async () => {
      mockSend.mockResolvedValueOnce({});
      const keys = await storage.getKeys();
      expect(keys).toEqual([]);
    });
  });

  describe('clear', () => {
    it('should delete all items', async () => {
      mockSend
        .mockResolvedValueOnce({
          Contents: [{ Key: 'x' }, { Key: 'y' }],
          NextContinuationToken: undefined,
        })
        .mockResolvedValue({});

      await storage.clear();

      expect(mockSend).toHaveBeenCalledWith(expect.any(ListObjectsV2Command));
      expect(mockSend).toHaveBeenCalledWith(expect.any(DeleteObjectCommand));
      expect(mockSend).toHaveBeenCalledTimes(3); // 1 list + 2 deletes
    });
  });

  describe('size', () => {
    it('should return number of keys', async () => {
      mockSend.mockResolvedValueOnce({
        Contents: [{ Key: '1' }, { Key: '2' }],
      });
      const size = await storage.size();
      expect(size).toBe(2);
    });
  });

  describe('error handling with logger', () => {
    const createMockLogger = () => ({
      error: vi.fn(),
      warn: vi.fn(),
      info: vi.fn(),
      debug: vi.fn(),
      configure: vi.fn(),
    });

    const createStorageWithLogger = async (logger: any) => {
      const storageWithLogger = new S3Storage();
      await storageWithLogger.initialize({
        region: 'us-east-1',
        bucket: 'test-bucket',
        logger,
      });
      return storageWithLogger;
    };

    it('should log errors when logger is available on getItem', async () => {
      const mockLogger = createMockLogger();
      const storageWithLogger = await createStorageWithLogger(mockLogger);

      const mockError = {
        name: 'AccessDenied',
        message: 'Access Denied',
        $metadata: { httpStatusCode: 403 },
      };
      mockSend.mockRejectedValueOnce(mockError);

      try {
        await storageWithLogger.getItem('key');
      } catch {
        // Expected to throw
      }

      expect(mockLogger.error).toHaveBeenCalledWith(
        'S3Storage::getItem failed',
        expect.objectContaining({
          operation: 'getItem',
          errorName: 'AccessDenied',
          errorMessage: 'Access Denied',
          bucket: 'test-bucket',
          statusCode: 403,
        }),
      );
    });

    it('should log errors when logger is available on hasItem', async () => {
      const mockLogger = createMockLogger();
      const storageWithLogger = await createStorageWithLogger(mockLogger);

      const mockError = {
        name: 'NetworkError',
        message: 'Network error occurred',
        $metadata: { httpStatusCode: 500 },
      };
      mockSend.mockRejectedValueOnce(mockError);

      try {
        await storageWithLogger.hasItem('key');
      } catch {
        // Expected to throw
      }

      expect(mockLogger.error).toHaveBeenCalledWith(
        'S3Storage::hasItem failed',
        expect.objectContaining({
          operation: 'hasItem',
          errorName: 'NetworkError',
          errorMessage: 'Network error occurred',
          bucket: 'test-bucket',
          statusCode: 500,
        }),
      );
    });

    it('should include error metadata in StorageError', async () => {
      const mockError = {
        name: 'InternalError',
        message: 'Internal server error',
        $metadata: { httpStatusCode: 500 },
      };
      mockSend.mockRejectedValueOnce(mockError);

      try {
        await storage.getItem('key');
        throw new Error('Should have thrown');
      } catch (error: any) {
        expect(error.name).toBe('StorageError');
        expect(error.operation).toBe('getItem');
        expect(error.cause).toBe(mockError);
        expect(error.metadata).toEqual({
          bucket: 'test-bucket',
          errorName: 'InternalError',
          statusCode: 500,
        });
      }
    });
  });
});
