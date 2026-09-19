import { describe, it, expect } from 'vitest';
import { getGenrePreset, relativeLuminance, contrastTextColor, deriveBackground } from './palettes.ts';

describe('getGenrePreset', () => {
  it('returns the matching preset case-insensitively and trimmed', () => {
    expect(getGenrePreset('Salsa')).toEqual(getGenrePreset('salsa'));
    expect(getGenrePreset('  reggae  ')).toEqual(getGenrePreset('reggae'));
  });

  it('falls back to the default preset for an unknown or empty genre', () => {
    const fallback = getGenrePreset('');
    expect(getGenrePreset('not-a-real-genre')).toEqual(fallback);
    expect(fallback.colorPalette.length).toBeGreaterThan(0);
  });
});

describe('relativeLuminance', () => {
  it('gives white the maximum luminance and black the minimum', () => {
    expect(relativeLuminance('#ffffff')).toBeCloseTo(1, 5);
    expect(relativeLuminance('#000000')).toBeCloseTo(0, 5);
  });
});

describe('contrastTextColor', () => {
  it('picks black text on a light background', () => {
    expect(contrastTextColor('#ffffff')).toBe('#000000');
  });

  it('picks white text on a dark background', () => {
    expect(contrastTextColor('#000000')).toBe('#ffffff');
  });
});

describe('deriveBackground', () => {
  it('returns a safe default for an empty palette', () => {
    expect(deriveBackground([])).toBe('#0a0a0a');
  });

  it('derives a background darker than the darkest input color', () => {
    const bg = deriveBackground(['#ffffff', '#808080', '#202020']);
    expect(relativeLuminance(bg)).toBeLessThan(relativeLuminance('#202020'));
  });
});
