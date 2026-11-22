import { describe, expect, it } from 'vitest';
import { createMarker } from '../../ui/src/playground/marker';

describe('createMarker', () => {
  it('creates a trace id and a traceparent that carries it', () => {
    const marker = createMarker();

    expect(marker.id).toMatch(/^[\da-f]{32}$/);
    expect(marker.traceparent).toMatch(new RegExp(`^00-${marker.id}-[\\da-f]{16}-01$`));
  });

  it('creates a different id each time', () => {
    expect(createMarker().id).not.toBe(createMarker().id);
  });

  it('never produces the all-zero ids the specification calls invalid', () => {
    const marker = createMarker((array) => array.fill(0));

    expect(marker.id).toBe(`${'0'.repeat(31)}1`);
    expect(marker.traceparent).toBe(`00-${'0'.repeat(31)}1-${'0'.repeat(15)}1-01`);
  });

  it('pads single-digit bytes', () => {
    expect(createMarker((array) => array.fill(10)).id).toBe('0a'.repeat(16));
  });
});
