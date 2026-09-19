// Vision analysis via Cloudflare Workers AI (plan §E), serverless port of server/src/claude.ts
// for the hosted deployment — reuses the same Cloudflare account already configured for
// painting generation (server/src/cloudflareImage.ts), so there's no new signup.
//
// Verified against live docs 2026-09-19: @cf/meta/llama-3.2-11b-vision-instruct takes exactly
// ONE image as a raw byte array (`image: number[]`, NOT base64) plus a `prompt` string — you
// can't combine `prompt` with `messages`, and multi-image input isn't supported. That's a real
// capability drop from the CLI's multi-frame analysis; both stages here use a single frame.
// It's also a much smaller open model than Claude, so JSON adherence is weaker — this keeps the
// CLI's exact fence-stripping + validate + one retry + genre-preset fallback ladder rather than
// trusting the model to always return clean JSON.
import type { VisionAnalysis } from '../../../shared/types.ts';
import { getGenrePreset } from '../../../shared/palettes.ts';

const MODEL = process.env.CLOUDFLARE_VISION_MODEL || '@cf/meta/llama-3.2-11b-vision-instruct';

export interface AnalysisHints {
  songTitle?: string;
  artist?: string;
  genre?: string;
  bpm?: number;
  energyWord?: string;
  smoothnessWord?: string;
}

function buildPrompt(hints: AnalysisHints, retry: boolean): string {
  const hintParts: string[] = [];
  if (hints.songTitle) hintParts.push(`canción "${hints.songTitle}"${hints.artist ? ` de ${hints.artist}` : ''}${hints.genre ? ` (${hints.genre})` : ''}`);
  if (hints.bpm) hintParts.push(`tempo medido ${hints.bpm} BPM`);
  if (hints.energyWord) hintParts.push(`energía de movimiento ${hints.energyWord}`);
  if (hints.smoothnessWord) hintParts.push(`calidad de movimiento ${hints.smoothnessWord}`);
  const hintLine = hintParts.length
    ? `Pistas secundarias (solo como desempate, NUNCA deben anular lo que ves en la imagen): ${hintParts.join(', ')}.`
    : '';

  return [
    'Estás analizando un fotograma de una actuación de baile en vivo.',
    'Concéntrate en LA PERSONA: su expresión facial, lenguaje corporal, y la calidad de su movimiento — eso es lo que domina el análisis. La ropa y el entorno son contexto secundario.',
    'A partir de lo que VES, determina: la tradición cultural de danza que evoca su movimiento, el estado de ánimo, y una paleta de 5-6 colores extraída de la escena y la cultura evocada.',
    hintLine,
    'Responde TODO en español (excepto los códigos de color hexadecimales).',
    'Devuelve SOLO un objeto JSON minificado, sin explicaciones ni bloques de código, con EXACTAMENTE esta forma:',
    '{"culture":string,"danceStyle":string,"mood":string,"colorPalette":["#RRGGBB", ... 5-6 colores],"artStyleReferences":[string,string],"perceivedExperience":string,"movementKeywords":[string,string,string,string]}',
    retry ? 'IMPORTANTE: tu respuesta anterior no fue JSON válido. Responde ÚNICAMENTE con el objeto JSON, nada más, sin texto antes o después.' : '',
  ].filter(Boolean).join('\n');
}

function isValidAnalysis(obj: unknown): obj is Omit<VisionAnalysis, 'fromVision'> {
  if (!obj || typeof obj !== 'object') return false;
  const o = obj as Record<string, unknown>;
  return (
    typeof o.culture === 'string' &&
    typeof o.danceStyle === 'string' &&
    typeof o.mood === 'string' &&
    Array.isArray(o.colorPalette) && o.colorPalette.length >= 5 &&
    o.colorPalette.every((c) => typeof c === 'string' && /^#[0-9a-fA-F]{6}$/.test(c)) &&
    Array.isArray(o.artStyleReferences) &&
    typeof o.perceivedExperience === 'string' &&
    Array.isArray(o.movementKeywords)
  );
}

function extractJson(text: string): unknown {
  const cleaned = text.trim().replace(/^```(?:json)?\n?/, '').replace(/```$/, '');
  // The model sometimes wraps the JSON in a sentence despite instructions — grab the outermost
  // {...} span rather than requiring the whole response to be pure JSON.
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  const jsonSlice = start !== -1 && end !== -1 ? cleaned.slice(start, end + 1) : cleaned;
  return JSON.parse(jsonSlice);
}

async function runCloudflare(imageBase64: string, hints: AnalysisHints, retry: boolean): Promise<unknown> {
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
  const token = process.env.CLOUDFLARE_API_TOKEN;
  if (!accountId || !token) throw new Error('Cloudflare not configured');

  const image = Array.from(Buffer.from(imageBase64, 'base64'));
  const res = await fetch(`https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run/${MODEL}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify({ image, prompt: buildPrompt(hints, retry), max_tokens: 512 }),
  });

  const data = (await res.json()) as { result?: { response?: string }; success?: boolean; errors?: unknown };
  if (!res.ok || !data.result?.response) {
    throw new Error(`Cloudflare vision request failed: ${JSON.stringify(data).slice(0, 300)}`);
  }
  return extractJson(data.result.response);
}

export async function analyzeVision(
  framesBase64: string[],
  _stage: 'quick' | 'full',
  hints: AnalysisHints,
): Promise<VisionAnalysis> {
  // Single-image model — pick one representative frame regardless of how many the caller sent.
  const frame = framesBase64[0];

  for (let attempt = 0; attempt < 2 && frame; attempt++) {
    try {
      const parsed = await runCloudflare(frame, hints, attempt > 0);
      if (isValidAnalysis(parsed)) return { ...parsed, fromVision: true };
      console.warn(`[vision] invalid analysis shape (attempt ${attempt + 1})`, parsed);
    } catch (err) {
      console.warn(`[vision] analysis failed (attempt ${attempt + 1})`, err);
    }
  }

  console.warn('[vision] falling back to genre preset — vision analysis unavailable');
  const preset = getGenrePreset(hints.genre ?? '');
  return {
    culture: 'universal',
    danceStyle: hints.genre ?? 'libre',
    mood: preset.mood,
    colorPalette: preset.colorPalette,
    artStyleReferences: ['arte abstracto expresionista'],
    perceivedExperience: 'una explosión de energía y color',
    movementKeywords: ['expresivo', 'libre', 'enérgico'],
    fromVision: false,
  };
}
