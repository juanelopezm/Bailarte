import { describe, it, expect } from 'vitest';
import { isNonEmptyString, isHexColor, isFiniteNumberInRange, isValidSessionCode, isValidEntryId, isOwnBlobUrl } from './validate.ts';

describe('isNonEmptyString', () => {
  it('rejects empty, whitespace-only, and over-length strings', () => {
    expect(isNonEmptyString('')).toBe(false);
    expect(isNonEmptyString('   ')).toBe(false);
    expect(isNonEmptyString('a'.repeat(201), 200)).toBe(false);
  });

  it('accepts a normal string within the length cap', () => {
    expect(isNonEmptyString('Juan')).toBe(true);
  });
});

describe('isHexColor', () => {
  it('accepts a valid 6-digit hex color and rejects everything else', () => {
    expect(isHexColor('#a1b2c3')).toBe(true);
    expect(isHexColor('#zzzzzz')).toBe(false);
    expect(isHexColor('a1b2c3')).toBe(false);
    expect(isHexColor('#fff')).toBe(false);
  });
});

describe('isFiniteNumberInRange', () => {
  it('rejects NaN, Infinity, and out-of-range values', () => {
    expect(isFiniteNumberInRange(NaN, 0, 100)).toBe(false);
    expect(isFiniteNumberInRange(Infinity, 0, 100)).toBe(false);
    expect(isFiniteNumberInRange(150, 0, 100)).toBe(false);
    expect(isFiniteNumberInRange(-1, 0, 100)).toBe(false);
  });

  it('accepts a value within range', () => {
    expect(isFiniteNumberInRange(50, 0, 100)).toBe(true);
  });
});

describe('isValidSessionCode', () => {
  it('matches the real 4-char uppercase+digit codes StageScreen generates', () => {
    expect(isValidSessionCode('88VX')).toBe(true);
  });

  it('rejects lowercase, wrong length, or garbage', () => {
    expect(isValidSessionCode('88vx')).toBe(false);
    expect(isValidSessionCode('AB')).toBe(false);
    expect(isValidSessionCode("'; DROP TABLE")).toBe(false);
  });
});

describe('isValidEntryId', () => {
  it('accepts a nanoid(8)-shaped id and rejects path-traversal-looking input', () => {
    expect(isValidEntryId('Yq33-Stw')).toBe(true);
    expect(isValidEntryId('../../etc/passwd')).toBe(false);
  });
});

describe('isOwnBlobUrl', () => {
  it('only accepts this project\'s own Blob storage domain', () => {
    expect(isOwnBlobUrl('https://mbdsxqlhjlkcvo04.public.blob.vercel-storage.com/gallery/a/thumb.jpg')).toBe(true);
    expect(isOwnBlobUrl('https://evil.example.com/x.jpg')).toBe(false);
    expect(isOwnBlobUrl('not a url')).toBe(false);
  });
});
