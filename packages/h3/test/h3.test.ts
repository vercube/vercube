import { type EventHandler, mockEvent } from 'h3';
import { beforeEach, describe, expect, it } from 'vitest';
import { type App, createApp } from '@vercube/core';
import { toH3 } from '../src';

describe('h3', () => {
  let app: App;
  let handler: EventHandler;

  beforeEach(async () => {
    app = await createApp();
    handler = toH3(app);
  });

  it('should handle h3 event', () => {
    const event = mockEvent('/api/test');
    const response = handler(event);

    expect(response).toBeDefined();
  });
});
