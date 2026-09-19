// Digital painting generation (plan §H). Composes the Gemini prompt from the vision analysis
// (authoritative — the person's expression/movement) and dance stats (movement backdrop),
// never from song metadata. Falls back gracefully when Gemini is unavailable/unconfigured.
import type { Request, Response } from 'express';
import { paintFromGesture } from '../gemini.ts';
import type { DanceStats, VisionAnalysis } from '../../../shared/types.ts';

// Visual STYLE comes purely from movement quality — never from culture/dance-tradition labels
// (user decision: culture/danceStyle are shown as text only, never shape the generated art).
function movementStyleFromStats(stats: DanceStats): string {
  const travelRate = stats.wristTravelMeters / Math.max(1, stats.durationMs / 1000); // m/s
  const energetic = travelRate > 0.8;
  const fluid = stats.smoothness > 0.55;
  if (energetic && fluid) return 'expresionismo abstracto dinámico y fluido, con trazos amplios y en movimiento continuo';
  if (energetic && !fluid) return 'abstracción gestual enérgica y fragmentada, con marcas angulares, dispersas y de alto contraste';
  if (!energetic && fluid) return 'composición abstracta serena y minimalista, con formas suaves, continuas y espaciadas';
  return 'abstracción delicada y precisa, con tensión sutil entre marcas cortas';
}

function buildPrompt(analysis: VisionAnalysis, stats: DanceStats): string {
  const durationSec = Math.round(stats.durationMs / 1000);
  const wristTravel = stats.wristTravelMeters.toFixed(1);
  const syncPct = Math.round(stats.grooveSyncPct * 100);
  const style = movementStyleFromStats(stats);

  return [
    `Crea una pintura digital ${style} que interprete un baile en vivo.`,
    `Estado de ánimo: ${analysis.mood}. Se sintió como: "${analysis.perceivedExperience}".`,
    `Movimiento: ${durationSec} segundos de baile, ${stats.jumps} saltos, ${stats.spins} giros,`,
    `${wristTravel} metros recorridos por las muñecas, ${syncPct}% sincronizado con el ritmo a ${stats.bpm || '—'} BPM.`,
    `Enfatiza estas cualidades de movimiento observadas: ${analysis.movementKeywords.join(', ')}.`,
    `Usa EXACTAMENTE esta paleta de colores: ${analysis.colorPalette.join(', ')}.`,
    'La imagen adjunta es una pintura gestual creada por los movimientos reales del bailarín — preserva sus trazos y composición principales como esqueleto y refínala en una obra terminada.',
    'Puramente abstracta: sin personas, sin caras, sin texto, sin marca de agua, sin motivos culturales o folclóricos literales. Calidad de museo.',
  ].join(' ');
}

export async function generatePainting(req: Request, res: Response) {
  const { analysis, stats, gesturePngBase64 } = req.body as {
    session?: string;
    analysis?: VisionAnalysis;
    stats?: DanceStats;
    gesturePngBase64?: string;
  };

  if (!analysis || !stats || !gesturePngBase64) {
    res.status(400).json({ error: 'missing analysis, stats, or gesturePngBase64' });
    return;
  }

  const prompt = buildPrompt(analysis, stats);
  console.log('[painting] prompt:', prompt);

  const buffer = await paintFromGesture(prompt, gesturePngBase64);
  if (!buffer) {
    res.json({ fallback: true });
    return;
  }

  res.json({ fallback: false, imageBase64: buffer.toString('base64') });
}
