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
  root.setProperty('--bg', bg);
  root.setProperty('--ink', contrastTextColor(bg));
}
