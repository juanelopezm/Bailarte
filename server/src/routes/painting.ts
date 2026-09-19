// Digital painting generation (plan §H). Composes the prompt from the vision analysis
// (authoritative — the person's expression/movement) and dance stats (movement backdrop),
// never from song metadata. Falls back gracefully when the image API is unavailable/unconfigured.
//
// Uses Cloudflare Workers AI (flux-1-schnell) instead of Gemini — see README "Known
// limitations": Gemini's image models require a billed Google Cloud project even on a
// "free tier" key. flux-1-schnell is TEXT-ONLY (no image input), unlike Gemini, so the prompt
// below describes the composition entirely in words rather than handing it a gesture-painting
// skeleton to refine.
import type { Request, Response } from 'express';
import { paintFromPrompt } from '../cloudflareImage.ts';
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
    `Pintura digital abstracta, ${style}, que interpreta un baile en vivo — sin ninguna referencia visual previa, compón la obra completa a partir de esta descripción.`,
    `Estado de ánimo: ${analysis.mood}. Se sintió como: "${analysis.perceivedExperience}".`,
    `Movimiento: ${durationSec} segundos de baile, ${stats.jumps} saltos, ${stats.spins} giros,`,
    `${wristTravel} metros recorridos por las muñecas, ${syncPct}% sincronizado con el ritmo a ${stats.bpm || '—'} BPM.`,
    `Enfatiza estas cualidades de movimiento observadas: ${analysis.movementKeywords.join(', ')}.`,
    `Usa EXACTAMENTE esta paleta de colores: ${analysis.colorPalette.join(', ')}.`,
    'Composición dinámica y equilibrada, con profundidad y capas de color.',
    'Puramente abstracta: sin personas, sin caras, sin texto, sin marca de agua, sin motivos culturales o folclóricos literales. Calidad de museo.',
  ].join(' ');
}

export async function generatePainting(req: Request, res: Response) {
  const { analysis, stats } = req.body as {
    session?: string;
    analysis?: VisionAnalysis;
    stats?: DanceStats;
  };

  if (!analysis || !stats) {
    res.status(400).json({ error: 'missing analysis or stats' });
    return;
  }

  const prompt = buildPrompt(analysis, stats);
  console.log('[painting] prompt:', prompt);

  const buffer = await paintFromPrompt(prompt);
  if (!buffer) {
    res.json({ fallback: true });
    return;
  }

  res.json({ fallback: false, imageBase64: buffer.toString('base64') });
}
