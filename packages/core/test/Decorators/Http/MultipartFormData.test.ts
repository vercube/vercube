import { beforeAll, describe, expect, it } from 'vitest';
import { initializeMetadata } from '../../../src';
import { createTestApp } from '../../Utils/App.mock';
import { MockController } from '../../Utils/MockController.mock';

describe('MultipartFormData Decorator', () => {
  beforeAll(async () => {
    await createTestApp();
  });

  it(`should add body to metadata`, () => {
    const meta = initializeMetadata(MockController.prototype);

    expect(meta.__methods['multipartFormData']).toBeDefined();
    expect(meta.__methods['multipartFormData'].args[0].type).toBe('multipart-form-data');
  });
});
