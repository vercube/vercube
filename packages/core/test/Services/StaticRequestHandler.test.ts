import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ConfigTypes } from '../../src/Types/ConfigTypes';
import { StaticRequestHandler } from '../../src/Services/Router/StaticRequestHandler';

// Mock Node.js modules
vi.mock('node:fs', () => ({
  createReadStream: vi.fn(() => ({
    pipe: vi.fn(),
    on: vi.fn(),
  })),
}));

vi.mock('node:fs/promises', () => ({
  stat: vi.fn(),
}));

vi.mock('node:path', () => ({
  normalize: vi.fn((path: string) => path),
  join: vi.fn((...paths: string[]) => paths.join('/')),
  extname: vi.fn((path: string) => {
    const ext = path.split('.').pop();
    return ext ? `.${ext}` : '';
  }),
}));

vi.mock('../../src/Utils/Mine', () => ({
  mime: {
    getType: vi.fn((ext: string) => {
      const types: Record<string, string> = {
        '.html': 'text/html',
        '.css': 'text/css',
        '.js': 'application/javascript',
        '.json': 'application/json',
        '.png': 'image/png',
        '.jpg': 'image/jpeg',
        '.gif': 'image/gif',
        '.svg': 'image/svg+xml',
        '.ico': 'image/x-icon',
      };
      return types[ext] || null;
    }),
  },
}));

describe('StaticRequestHandler', () => {
  let staticHandler: StaticRequestHandler;
  let mockStat: any;
  let mockCreateReadStream: any;

  beforeEach(async () => {
    staticHandler = new StaticRequestHandler();

    // Get mocked functions
    const { stat } = await import('node:fs/promises');
    const { createReadStream } = await import('node:fs');

    mockStat = vi.mocked(stat);
    mockCreateReadStream = vi.mocked(createReadStream);

    vi.clearAllMocks();
  });

  describe('initialize', () => {
    it('should initialize with static options', () => {
      const options: ConfigTypes.ServerOptions['static'] = {
        dirs: ['/public', '/assets'],
        maxAge: 3600,
        immutable: true,
        etag: true,
      };

      expect(() => {
        staticHandler.initialize(options);
      }).not.toThrow();
    });

    it('should initialize with undefined options', () => {
      expect(() => {
        staticHandler.initialize(undefined);
      }).not.toThrow();
    });
  });

  describe('handleRequest', () => {
    beforeEach(() => {
      staticHandler.initialize({
        dirs: ['/public', '/assets'],
        maxAge: 3600,
        immutable: true,
        etag: true,
      });
    });

    it('should return undefined when no static dirs are configured', async () => {
      staticHandler.initialize({ dirs: [] });
      const request = new Request('http://localhost/public/test.html');

      const result = await staticHandler.handleRequest(request);

      expect(result).toBeUndefined();
    });

    it('should return undefined when dirs is undefined', async () => {
      staticHandler.initialize({ dirs: undefined as any });
      const request = new Request('http://localhost/public/test.html');

      const result = await staticHandler.handleRequest(request);

      expect(result).toBeUndefined();
    });

    it('should return undefined for non-GET requests', async () => {
      const request = new Request('http://localhost/public/test.html', {
        method: 'POST',
      });

      const result = await staticHandler.handleRequest(request);

      expect(result).toBeUndefined();
    });

    it('should return undefined when file is not found', async () => {
      const request = new Request('http://localhost/public/test.html');
      mockStat.mockRejectedValue(new Error('File not found'));

      const result = await staticHandler.handleRequest(request);

      expect(result).toBeUndefined();
    });

    it('should return undefined when path is a directory', async () => {
      const request = new Request('http://localhost/public/');
      mockStat.mockResolvedValue({
        isDirectory: () => true,
        isFile: () => false,
      });

      const result = await staticHandler.handleRequest(request);

      expect(result).toBeUndefined();
    });

    it('should serve file when found', async () => {
      const request = new Request('http://localhost/public/test.html');
      const mockStats = {
        isDirectory: () => false,
        isFile: () => true,
        size: 1024,
        mtime: new Date('2023-01-01'),
      };

      mockStat.mockResolvedValue(mockStats);
      mockCreateReadStream.mockReturnValue({
        pipe: vi.fn(),
        on: vi.fn(),
      });

      const result = await staticHandler.handleRequest(request);

      expect(result).toBeInstanceOf(Response);
      expect(mockStat).toHaveBeenCalled();
    });

    it('should handle multiple static directories', async () => {
      const request = new Request('http://localhost/assets/image.png');
      const mockStats = {
        isDirectory: () => false,
        isFile: () => true,
        size: 2048,
        mtime: new Date('2023-01-01'),
      };

      mockStat.mockRejectedValueOnce(new Error('Not found in first dir')).mockResolvedValue(mockStats);
      mockCreateReadStream.mockReturnValue({
        pipe: vi.fn(),
        on: vi.fn(),
      });

      const result = await staticHandler.handleRequest(request);

      expect(result).toBeInstanceOf(Response);
    });

    it('should handle path normalization', async () => {
      const request = new Request('http://localhost/public/../public/test.html');
      const mockStats = {
        isDirectory: () => false,
        isFile: () => true,
        size: 1024,
        mtime: new Date('2023-01-01'),
      };

      mockStat.mockResolvedValue(mockStats);
      mockCreateReadStream.mockReturnValue({
        pipe: vi.fn(),
        on: vi.fn(),
      });

      const result = await staticHandler.handleRequest(request);

      expect(result).toBeInstanceOf(Response);
    });

    it('should handle file with unknown extension', async () => {
      const request = new Request('http://localhost/public/test.unknown');
      const mockStats = {
        isDirectory: () => false,
        isFile: () => true,
        size: 1024,
        mtime: new Date('2023-01-01'),
      };

      mockStat.mockResolvedValue(mockStats);
      mockCreateReadStream.mockReturnValue({
        pipe: vi.fn(),
        on: vi.fn(),
      });

      const result = await staticHandler.handleRequest(request);

      expect(result).toBeInstanceOf(Response);
    });

    it('should handle file without extension', async () => {
      const request = new Request('http://localhost/public/test');
      const mockStats = {
        isDirectory: () => false,
        isFile: () => true,
        size: 1024,
        mtime: new Date('2023-01-01'),
      };

      mockStat.mockResolvedValue(mockStats);
      mockCreateReadStream.mockReturnValue({
        pipe: vi.fn(),
        on: vi.fn(),
      });

      const result = await staticHandler.handleRequest(request);

      expect(result).toBeInstanceOf(Response);
    });
  });

  describe('serveFile', () => {
    beforeEach(() => {
      staticHandler.initialize({
        dirs: ['/public'],
        maxAge: 3600,
        immutable: true,
        etag: true,
      });
    });

    it('should serve HTML file with correct headers', async () => {
      const mockStats = {
        isDirectory: () => false,
        isFile: () => true,
        size: 1024,
        mtime: new Date('2023-01-01T00:00:00.000Z'),
      };

      mockCreateReadStream.mockReturnValue({
        pipe: vi.fn(),
        on: vi.fn(),
      });

      const result = await (staticHandler as any).serveFile('/public/test.html', mockStats);

      expect(result).toBeInstanceOf(Response);
      expect(result.headers.get('Content-Type')).toBe('text/html');
      expect(result.headers.get('Content-Length')).toBe('1024');
      expect(result.headers.get('Cache-Control')).toBe('public, max-age=3600, immutable');
      expect(result.headers.get('ETag')).toBe('W/"1024-1672531200000"');
    });

    it('should serve CSS file with correct headers', async () => {
      const mockStats = {
        isDirectory: () => false,
        isFile: () => true,
        size: 2048,
        mtime: new Date('2023-01-01T00:00:00.000Z'),
      };

      mockCreateReadStream.mockReturnValue({
        pipe: vi.fn(),
        on: vi.fn(),
      });

      const result = await (staticHandler as any).serveFile('/public/style.css', mockStats);

      expect(result).toBeInstanceOf(Response);
      expect(result.headers.get('Content-Type')).toBe('text/css');
      expect(result.headers.get('Content-Length')).toBe('2048');
    });

    it('should serve JavaScript file with correct headers', async () => {
      const mockStats = {
        isDirectory: () => false,
        isFile: () => true,
        size: 512,
        mtime: new Date('2023-01-01T00:00:00.000Z'),
      };

      mockCreateReadStream.mockReturnValue({
        pipe: vi.fn(),
        on: vi.fn(),
      });

      const result = await (staticHandler as any).serveFile('/public/script.js', mockStats);

      expect(result).toBeInstanceOf(Response);
      expect(result.headers.get('Content-Type')).toBe('application/javascript');
      expect(result.headers.get('Content-Length')).toBe('512');
    });

    it('should serve image file with correct headers', async () => {
      const mockStats = {
        isDirectory: () => false,
        isFile: () => true,
        size: 4096,
        mtime: new Date('2023-01-01T00:00:00.000Z'),
      };

      mockCreateReadStream.mockReturnValue({
        pipe: vi.fn(),
        on: vi.fn(),
      });

      const result = await (staticHandler as any).serveFile('/public/image.png', mockStats);

      expect(result).toBeInstanceOf(Response);
      expect(result.headers.get('Content-Type')).toBe('image/png');
      expect(result.headers.get('Content-Length')).toBe('4096');
    });

    it('should serve file without caching when maxAge is 0', async () => {
      staticHandler.initialize({
        dirs: ['/public'],
        maxAge: 0,
        etag: true,
      });

      const mockStats = {
        isDirectory: () => false,
        isFile: () => true,
        size: 1024,
        mtime: new Date('2023-01-01T00:00:00.000Z'),
      };

      mockCreateReadStream.mockReturnValue({
        pipe: vi.fn(),
        on: vi.fn(),
      });

      const result = await (staticHandler as any).serveFile('/public/test.html', mockStats);

      expect(result).toBeInstanceOf(Response);
      expect(result.headers.get('Cache-Control')).toBeNull();
    });

    it('should serve file without ETag when etag is false', async () => {
      staticHandler.initialize({
        dirs: ['/public'],
        maxAge: 3600,
        etag: false,
      });

      const mockStats = {
        isDirectory: () => false,
        isFile: () => true,
        size: 1024,
        mtime: new Date('2023-01-01T00:00:00.000Z'),
      };

      mockCreateReadStream.mockReturnValue({
        pipe: vi.fn(),
        on: vi.fn(),
      });

      const result = await (staticHandler as any).serveFile('/public/test.html', mockStats);

      expect(result).toBeInstanceOf(Response);
      expect(result.headers.get('ETag')).toBeNull();
    });

    it('should serve file with unknown extension as octet-stream', async () => {
      const mockStats = {
        isDirectory: () => false,
        isFile: () => true,
        size: 1024,
        mtime: new Date('2023-01-01T00:00:00.000Z'),
      };

      mockCreateReadStream.mockReturnValue({
        pipe: vi.fn(),
        on: vi.fn(),
      });

      const result = await (staticHandler as any).serveFile('/public/test.unknown', mockStats);

      expect(result).toBeInstanceOf(Response);
      expect(result.headers.get('Content-Type')).toBe('application/octet-stream');
    });
  });
});
