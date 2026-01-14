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

  describe('initialization', () => {
    it('should initialize without credentials (for IAM role support)', async () => {
      const storageWithoutCreds = new S3Storage();
      await expect(
        storageWithoutCreds.initialize({
          region: 'us-east-1',
          bucket: 'test-bucket'
          // No credentials - should use IAM role or default credential chain
        })
      ).resolves.not.toThrow();
    });

    it('should initialize with explicit credentials', async () => {
      const storageWithCreds = new S3Storage();
      await expect(
        storageWithCreds.initialize({
          region: 'us-east-1',
          bucket: 'test-bucket',
          credentials: {
            accessKeyId: 'test-key',
            secretAccessKey: 'test-secret'
          }
        })
      ).resolves.not.toThrow();
    });

    it('should initialize with STS temporary credentials', async () => {
      const storageWithSTS = new S3Storage();
      await expect(
        storageWithSTS.initialize({
          region: 'us-east-1',
          bucket: 'test-bucket',
          credentials: {
            accessKeyId: 'temp-key',
            secretAccessKey: 'temp-secret',
            sessionToken: 'temp-session-token'
          }
        })
      ).resolves.not.toThrow();
    });
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

    it('should throw for other errors', async () => {
      mockSend.mockRejectedValueOnce({ name: 'OtherError' });
      await expect(storage.getItem('key')).rejects.toEqual({
        name: 'OtherError',
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

    it('should throw on other errors', async () => {
      mockSend.mockRejectedValueOnce({ name: 'OtherError' });
      await expect(storage.hasItem('key')).rejects.toEqual({
        name: 'OtherError',
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
});
