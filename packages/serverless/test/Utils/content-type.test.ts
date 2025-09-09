import { describe, expect, it } from 'vitest';
import { isTextType } from '../../src/Utils';

describe('Utils - Content Type', () => {
  describe('isTextType', () => {
    it('should return false for empty content type', () => {
      expect(isTextType('')).toBe(false);
    });

    it('should return false for undefined content type', () => {
      expect(isTextType(undefined as any)).toBe(false);
    });

    it('should return false for null content type', () => {
      expect(isTextType(null as any)).toBe(false);
    });

    it('should return true for text/* content types', () => {
      expect(isTextType('text/plain')).toBe(true);
      expect(isTextType('text/html')).toBe(true);
      expect(isTextType('text/css')).toBe(true);
      expect(isTextType('text/javascript')).toBe(true);
      expect(isTextType('text/xml')).toBe(true);
      expect(isTextType('text/csv')).toBe(true);
    });

    it('should return true for application/json', () => {
      expect(isTextType('application/json')).toBe(true);
    });

    it('should return true for application/javascript', () => {
      expect(isTextType('application/javascript')).toBe(true);
    });

    it('should return true for application/xml', () => {
      expect(isTextType('application/xml')).toBe(true);
    });

    it('should return true for application/xml+text', () => {
      expect(isTextType('application/xml+text')).toBe(true);
    });

    it('should return true for application/x-www-form-urlencoded', () => {
      expect(isTextType('application/x-www-form-urlencoded')).toBe(true);
    });

    it('should return true for application/*+json content types', () => {
      expect(isTextType('application/vnd.api+json')).toBe(true);
      expect(isTextType('application/ld+json')).toBe(true);
      expect(isTextType('application/hal+json')).toBe(true);
      expect(isTextType('application/problem+json')).toBe(true);
    });

    it('should return true for application/*+xml content types', () => {
      expect(isTextType('application/atom+xml')).toBe(true);
      expect(isTextType('application/rss+xml')).toBe(true);
      expect(isTextType('application/svg+xml')).toBe(true);
      expect(isTextType('application/xhtml+xml')).toBe(true);
    });

    it('should return true for content types with utf-8 encoding', () => {
      expect(isTextType('text/plain; charset=utf-8')).toBe(true);
      expect(isTextType('application/json; charset=utf-8')).toBe(true);
      expect(isTextType('text/html; charset=UTF-8')).toBe(true);
      expect(isTextType('application/xml; charset=utf8')).toBe(true);
    });

    it('should return false for binary content types', () => {
      expect(isTextType('image/jpeg')).toBe(false);
      expect(isTextType('image/png')).toBe(false);
      expect(isTextType('image/gif')).toBe(false);
      expect(isTextType('image/svg+xml')).toBe(false); // image/*+xml is not considered text by isTextType
      expect(isTextType('video/mp4')).toBe(false);
      expect(isTextType('audio/mpeg')).toBe(false);
      expect(isTextType('application/pdf')).toBe(false);
      expect(isTextType('application/zip')).toBe(false);
      expect(isTextType('application/octet-stream')).toBe(false);
    });

    it('should return false for other application content types', () => {
      expect(isTextType('application/xml-dtd')).toBe(false);
      expect(isTextType('application/xml-external-parsed-entity')).toBe(false);
      expect(isTextType('application/xml')).toBe(true); // This should be true
      expect(isTextType('application/xml+text')).toBe(true); // This should be true
    });

    it('should handle case variations', () => {
      // Note: The current implementation is case-sensitive, so these should be false
      expect(isTextType('TEXT/PLAIN')).toBe(false);
      expect(isTextType('Application/JSON')).toBe(false);
      expect(isTextType('APPLICATION/JAVASCRIPT')).toBe(false);
      expect(isTextType('Text/HTML; Charset=UTF-8')).toBe(false);
    });

    it('should handle content types with additional parameters', () => {
      expect(isTextType('text/plain; charset=utf-8; boundary=something')).toBe(true);
      expect(isTextType('application/json; charset=utf-8; version=1.0')).toBe(true);
      expect(isTextType('text/html; charset=utf-8; encoding=gzip')).toBe(true);
    });

    it('should handle edge cases with special characters', () => {
      expect(isTextType('text/plain; charset="utf-8"')).toBe(true);
      expect(isTextType("application/json; charset='utf-8'")).toBe(true);
      expect(isTextType('text/html; charset=utf-8; boundary="multipart"')).toBe(true);
    });

    it('should handle malformed content types gracefully', () => {
      expect(isTextType('text/')).toBe(true);
      expect(isTextType('application/')).toBe(false);
      expect(isTextType('text')).toBe(false);
      expect(isTextType('application')).toBe(false);
      expect(isTextType('/json')).toBe(false);
      expect(isTextType('json')).toBe(false);
    });

    it('should handle content types with whitespace', () => {
      // Note: The current implementation doesn't trim whitespace, so these should be false
      expect(isTextType(' text/plain ')).toBe(false);
      expect(isTextType(' application/json ')).toBe(false);
      expect(isTextType('text/plain ; charset=utf-8')).toBe(true); // This should still work
    });

    it('should handle complex content types', () => {
      expect(isTextType('application/vnd.openxmlformats-officedocument.wordprocessingml.document')).toBe(false);
      expect(isTextType('application/vnd.api+json; charset=utf-8')).toBe(true);
      expect(isTextType('application/atom+xml; charset=utf-8; type=feed')).toBe(true);
    });
  });
});
