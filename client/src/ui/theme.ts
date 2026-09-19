// Adaptive UI theming (plan §M): the whole interface re-themes from the vision-derived palette.
// CSS custom properties + a `transition` on the consuming elements (already set in index.css)
// makes the Stage A mid-dance re-theme read as a visible "it's watching you" moment.
import { deriveBackground, contrastTextColor } from '@shared/palettes.ts';

export function applyPalette(hexes: string[]) {
  if (hexes.length === 0) return;
  const root = document.documentElement.style;
  for (let i = 0; i < 6; i++) {
    root.setProperty(`--c${i + 1}`, hexes[i % hexes.length]);
  }
  const bg = deriveBackground(hexes);
  const ink = contrastTextColor(bg);
  root.setProperty('--bg', bg);
  root.setProperty('--ink', ink);
  // --ink-dim/--ink-faint are hardcoded light in index.css for the default dark theme — once
  // the adaptive background can go light, they must be derived from the SAME ink color or
  // secondary text silently becomes illegible (light gray on a light background).
  const rgb = ink === '#ffffff' ? '255,255,255' : '0,0,0';
  root.setProperty('--ink-dim', `rgba(${rgb},0.65)`);
  root.setProperty('--ink-faint', `rgba(${rgb},0.4)`);
}
