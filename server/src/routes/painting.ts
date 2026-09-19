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
  const style = movementStyleFromStats(stats);
  // First clause only — analysis.mood can be a full descriptive sentence, and a long Spanish
  // fragment dilutes the English "no people" instruction's weight in a short prompt.
  const moodShort = analysis.mood.split(/[,;.]/)[0].trim();

  // flux-1-schnell has no negative_prompt parameter (verified against current docs) — a small
  // distilled model like this pattern-matches on subject nouns regardless of "no X" phrasing,
  // so the only reliable fix is to never name a figurative subject at all. This deliberately
  // excludes analysis.perceivedExperience and analysis.movementKeywords from the image prompt:
  // Claude's vision analysis often describes literal body language ("el cuerpo sostenía...",
  // "las manos vibrando...") since that's what it's asked to observe, and any body-part or
  // human-figure noun reliably produced a literal dancer in testing, even prefixed by "no
  // people". Only pure-abstract vocabulary (art style, mood adjective, hex colors) reaches
  // the prompt; the richer analysis fields still drive the UI text and the sculpture/replay.
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
