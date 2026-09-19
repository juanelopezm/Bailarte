// Digital painting generation (plan §H), serverless port of server/src/routes/painting.ts —
// identical logic, duplicated rather than cross-imported (see api/index.ts's comment on why
// cross-workspace imports don't survive Vercel's function bundling).
import type { Request, Response } from 'express';
import { paintFromPrompt } from '../lib/cloudflareImage.ts';
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
  const style = movementStyleFromStats(stats);
  const moodShort = analysis.mood.split(/[,;.]/)[0].trim();

  return [
    'Non-figurative abstract art, no people, no human figures, no faces, no bodies, no silhouettes anywhere in the image.',
    `An abstract painting: ${style}.`,
    `Emotional tone: ${moodShort}.`,
    `Use EXACTLY this color palette: ${analysis.colorPalette.join(', ')}.`,
    'Pure color field and gestural mark-making only, like Kandinsky or Pollock. Dynamic balanced composition with depth and layered color.',
    'No text, no watermark, no logos, no literal objects, no recognizable subjects. Gallery quality abstract art.',
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
