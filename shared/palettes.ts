// Fallback palettes used when the claude CLI vision analysis is unavailable, plus WCAG contrast
// helpers used to auto-pick readable text color against the adaptive theme background.
// See plan §E (robustness ladder) and §M (adaptive theming).

export interface GenrePreset {
  mood: string;
  colorPalette: string[];
}

const DEFAULT_PRESET: GenrePreset = {
  mood: 'energetic and warm',
  colorPalette: ['#1a1025', '#3d2b56', '#a13d63', '#e8615a', '#f5b642', '#f2e5c8'],
};

const GENRE_PRESETS: Record<string, GenrePreset> = {
  salsa: { mood: 'vibrant and passionate', colorPalette: ['#2b0a0a', '#7a1f1f', '#c94f4f', '#e8935a', '#f4d35e', '#f7f3e3'] },
  cumbia: { mood: 'joyful and grounded', colorPalette: ['#20260d', '#4c5b21', '#8fa031', '#d9b34a', '#e8dab2', '#fef9ef'] },
  afrobeats: { mood: 'bright and celebratory', colorPalette: ['#1a0f2e', '#5a1e6b', '#c2417d', '#f2735a', '#f9c74f', '#fff1e0'] },
  bollywood: { mood: 'exuberant and colorful', colorPalette: ['#2d0a3e', '#7b1fa2', '#e91e8c', '#ff7043', '#ffd54f', '#fff8e1'] },
  'k-pop': { mood: 'sleek and electric', colorPalette: ['#0d0d1a', '#2a2a5e', '#5e5ee6', '#e64fa3', '#4fe6d0', '#f5f5ff'] },
  'flamenco-pop': { mood: 'fierce and dramatic', colorPalette: ['#1a0505', '#5c0a1e', '#a3123a', '#e0435a', '#f2a341', '#f9e9d8'] },
  samba: { mood: 'bright and rhythmic', colorPalette: ['#0f2418', '#1f5c3f', '#3fa66b', '#f2c14e', '#f27649', '#fff6e5'] },
  reggae: { mood: 'relaxed and soulful', colorPalette: ['#0d1f0d', '#1e5c1e', '#e8b923', '#e04f3d', '#f2f2e0', '#1a1a1a'] },
  'hip-hop': { mood: 'bold and confident', colorPalette: ['#0a0a0a', '#2b2b2b', '#6b1f6b', '#c9184a', '#f4a261', '#f0f0f0'] },
  house: { mood: 'hypnotic and driving', colorPalette: ['#0a0a1a', '#2e2e5e', '#6e5ee6', '#e64fc2', '#4fd1e6', '#f0f0ff'] },
  reggaeton: { mood: 'sultry and upbeat', colorPalette: ['#1a0a1a', '#5c1a3d', '#c9184a', '#e88a2e', '#f2d94e', '#fff3e0'] },
  bhangra: { mood: 'exuberant and powerful', colorPalette: ['#2e0a0a', '#8a1f1f', '#e0632e', '#f2b134', '#f9e0a0', '#fff8ee'] },
  'son cubano': { mood: 'warm and nostalgic', colorPalette: ['#2b1a0a', '#6b4423', '#c98a3d', '#e8c974', '#f2e8d0', '#1a1a1a'] },
  amapiano: { mood: 'smooth and grooving', colorPalette: ['#0d1a1a', '#1e4a4a', '#3d8a8a', '#f2b134', '#e8615a', '#f0f5f5'] },
  soukous: { mood: 'lively and buoyant', colorPalette: ['#1a1a0a', '#5c5c1e', '#a3a33d', '#e8b923', '#f2735a', '#fdf9ee'] },
  dancehall: { mood: 'fierce and free', colorPalette: ['#0a0a0a', '#2e2e2e', '#e0b923', '#c9184a', '#4fe66b', '#f0f0f0'] },
  tango: { mood: 'intense and elegant', colorPalette: ['#0a0505', '#2e0f14', '#6b1f2e', '#a3123a', '#d4a94e', '#f2e8dc'] },
  'balkan brass': { mood: 'wild and triumphant', colorPalette: ['#1a0a0a', '#5c1f0a', '#c9541f', '#e8b923', '#8a1f3d', '#fdf2e0'] },
  'j-pop': { mood: 'bright and hopeful', colorPalette: ['#0a0a1a', '#2e2e5e', '#e64f8a', '#4fd1e6', '#f2e04f', '#f5f5ff'] },
  'arabic pop': { mood: 'sultry and rich', colorPalette: ['#1a0d05', '#5c2e0a', '#a35c1f', '#e0a341', '#c9184a', '#f9e8d0'] },
  afropop: { mood: 'bright and free', colorPalette: ['#1a0f2e', '#4a1e6b', '#e0632e', '#f2b134', '#3da66b', '#fff3e0'] },
  merengue: { mood: 'fast and joyful', colorPalette: ['#1a0a1a', '#6b1f5c', '#e0632e', '#f2d94e', '#3da6a6', '#fff8ee'] },
  disco: { mood: 'glamorous and euphoric', colorPalette: ['#0a0a1a', '#2e0a5e', '#c918a3', '#e6a34f', '#4fd1e6', '#f5f0ff'] },
  edm: { mood: 'electric and euphoric', colorPalette: ['#050510', '#1a1a4a', '#5e5ee6', '#e64fc2', '#4feee6', '#eef0ff'] },
};

export function getGenrePreset(genre: string): GenrePreset {
  const key = genre.trim().toLowerCase();
  return GENRE_PRESETS[key] ?? DEFAULT_PRESET;
}

/** Relative luminance per WCAG 2.x, for a "#RRGGBB" hex color. */
export function relativeLuminance(hex: string): number {
  const c = hex.replace('#', '');
  const r = parseInt(c.substring(0, 2), 16) / 255;
  const g = parseInt(c.substring(2, 4), 16) / 255;
  const b = parseInt(c.substring(4, 6), 16) / 255;
  const lin = (v: number) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

/** Picks black or white text for best contrast against the given background hex. */
export function contrastTextColor(bgHex: string): '#000000' | '#ffffff' {
  return relativeLuminance(bgHex) > 0.35 ? '#000000' : '#ffffff';
}

function mixHexTowardBlack(hex: string, amount: number): string {
  const c = hex.replace('#', '');
  const r = Math.round(parseInt(c.substring(0, 2), 16) * (1 - amount));
  const g = Math.round(parseInt(c.substring(2, 4), 16) * (1 - amount));
  const b = Math.round(parseInt(c.substring(4, 6), 16) * (1 - amount));
  return `#${[r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('')}`;
}

/** Derives a dark background from the darkest palette entry, for the adaptive theme. */
export function deriveBackground(palette: string[]): string {
  if (palette.length === 0) return '#0a0a0a';
  const darkest = palette.reduce((a, b) => (relativeLuminance(a) < relativeLuminance(b) ? a : b));
  return mixHexTowardBlack(darkest, 0.35);
}
