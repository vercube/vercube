import { describe, it, expect } from 'vitest';
import { mime } from '../../src/Utils/Mine';

describe('Mine', () => {
  describe('mime.getType', () => {
    it('should return correct mime type for HTML files', () => {
      expect(mime.getType('.html')).toBe('text/html');
    });

    it('should return correct mime type for CSS files', () => {
      expect(mime.getType('.css')).toBe('text/css');
    });

    it('should return correct mime type for JavaScript files', () => {
      expect(mime.getType('.js')).toBe('application/javascript');
    });

    it('should return correct mime type for JSON files', () => {
      expect(mime.getType('.json')).toBe('application/json');
    });

    it('should return correct mime type for PNG files', () => {
      expect(mime.getType('.png')).toBe('image/png');
    });

    it('should return correct mime type for JPG files', () => {
      expect(mime.getType('.jpg')).toBe('image/jpeg');
    });

    it('should return correct mime type for JPEG files', () => {
      expect(mime.getType('.jpeg')).toBe('image/jpeg');
    });

    it('should return correct mime type for GIF files', () => {
      expect(mime.getType('.gif')).toBe('image/gif');
    });

    it('should return correct mime type for SVG files', () => {
      expect(mime.getType('.svg')).toBe('image/svg+xml');
    });

    it('should return correct mime type for ICO files', () => {
      expect(mime.getType('.ico')).toBe('image/x-icon');
    });

    it('should return null for unknown file extensions', () => {
      expect(mime.getType('.unknown')).toBe(null);
    });

    it('should return null for empty extension', () => {
      expect(mime.getType('')).toBe(null);
    });

    it('should return null for extension without dot', () => {
      expect(mime.getType('txt')).toBe(null);
    });

    it('should return null for undefined extension', () => {
      expect(mime.getType(undefined as any)).toBe(null);
    });

    it('should return null for null extension', () => {
      expect(mime.getType(null as any)).toBe(null);
    });
  });
});
