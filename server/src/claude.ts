// Vision analysis via the local `claude` CLI (plan §E). This is the person-first pipeline:
// culture, mood, palette, and perceived experience are derived from what is SEEN in the
// dancer's keyframes — expression, body language, movement quality — never from the song.
// Song/tempo data is passed only as a secondary, explicitly-subordinate hint.
import { execFile } from 'node:child_process';
import type { VisionAnalysis } from '../../shared/types.ts';
import { getGenrePreset } from '../../shared/palettes.ts';

const SCHEMA = JSON.stringify({
  type: 'object',
  additionalProperties: false,
  required: ['culture', 'danceStyle', 'mood', 'colorPalette', 'artStyleReferences', 'perceivedExperience', 'movementKeywords'],
  properties: {
    culture: { type: 'string' },
    danceStyle: { type: 'string' },
    mood: { type: 'string' },
    colorPalette: { type: 'array', items: { type: 'string', pattern: '^#[0-9a-fA-F]{6}$' }, minItems: 5, maxItems: 6 },
    artStyleReferences: { type: 'array', items: { type: 'string' }, minItems: 2, maxItems: 4 },
    perceivedExperience: { type: 'string' },
    movementKeywords: { type: 'array', items: { type: 'string' }, minItems: 4, maxItems: 6 },
  },
});

export interface AnalysisHints {
  songTitle?: string;
  artist?: string;
  genre?: string;
  bpm?: number;
  energyWord?: string;
  smoothnessWord?: string;
}

function buildPrompt(fileNames: string[], stage: 'quick' | 'full', hints: AnalysisHints, retry: boolean): string {
  const fileList = fileNames.join(', ');
  const hintParts: string[] = [];
  if (hints.songTitle) hintParts.push(`canción "${hints.songTitle}"${hints.artist ? ` de ${hints.artist}` : ''}${hints.genre ? ` (${hints.genre})` : ''}`);
  if (hints.bpm) hintParts.push(`tempo medido ${hints.bpm} BPM`);
  if (hints.energyWord) hintParts.push(`energía de movimiento ${hints.energyWord}`);
  if (hints.smoothnessWord) hintParts.push(`calidad de movimiento ${hints.smoothnessWord}`);
  const hintLine = hintParts.length
    ? `Pistas secundarias (solo como desempate, NUNCA deben anular lo que ves en las imágenes): ${hintParts.join(', ')}.`
    : '';

  const scope = stage === 'quick'
    ? `Lee este fotograma del video: ${fileList}. Esto es un vistazo RÁPIDO a mitad del baile — da tu mejor estimación inicial.`
    : `Lee estos fotogramas del video, muestreados a lo largo de toda la actuación: ${fileList}.`;

  return [
    'Estás analizando una actuación de baile en vivo a partir de fotogramas de video.',
    scope,
    'Concéntrate en LA PERSONA: su expresión facial, lenguaje corporal, y la calidad de su movimiento a través de los fotogramas — eso es lo que domina el análisis. La ropa y el entorno son contexto secundario.',
    'A partir de lo que VES (las imágenes son la fuente autorizada), determina: la tradición cultural de danza que evoca su movimiento, el estado de ánimo, y una paleta de 5-6 colores extraída de la escena y la cultura evocada.',
    hintLine,
    'Responde TODO en español (excepto los códigos de color hexadecimales).',
    'Devuelve SOLO el JSON, sin explicaciones ni bloques de código.',
    retry ? 'IMPORTANTE: tu respuesta anterior no fue JSON válido. Responde ÚNICAMENTE con el objeto JSON, nada más.' : '',
  ].filter(Boolean).join('\n');
}

interface ClaudeEnvelope {
  is_error?: boolean;
  result?: string;
  structured_output?: unknown;
}

function runClaude(prompt: string, cwd: string, useHaiku: boolean): Promise<ClaudeEnvelope> {
  const args = [
    '-p', prompt,
    '--output-format', 'json',
    '--json-schema', SCHEMA,
    '--allowedTools', 'Read',
  ];
  if (useHaiku) args.push('--model', 'haiku');

  return new Promise((resolve, reject) => {
    execFile(
      process.env.CLAUDE_BIN ?? 'claude',
      args,
      { timeout: 90_000, maxBuffer: 10 * 1024 * 1024, cwd },
      (err, stdout) => {
        if (err) return reject(err);
        try {
          resolve(JSON.parse(stdout) as ClaudeEnvelope);
        } catch (parseErr) {
          reject(parseErr);
        }
      },
    );
  });
}

function extractJson(envelope: ClaudeEnvelope): unknown {
  if (envelope.structured_output) return envelope.structured_output;
  if (!envelope.result) throw new Error('no result field in claude envelope');
  const cleaned = envelope.result.trim().replace(/^```(?:json)?\n?/, '').replace(/```$/, '');
  return JSON.parse(cleaned);
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

export async function analyzeVision(
  frameDir: string,
  fileNames: string[],
  stage: 'quick' | 'full',
  hints: AnalysisHints,
): Promise<VisionAnalysis> {
  for (const retry of [false, true]) {
    try {
      const prompt = buildPrompt(fileNames, stage, hints, retry);
      const envelope = await runClaude(prompt, frameDir, stage === 'quick');
      if (envelope.is_error) throw new Error('claude reported an error');
      const parsed = extractJson(envelope);
      if (isValidAnalysis(parsed)) {
        return { ...parsed, fromVision: true };
      }
      console.warn(`[claude] invalid analysis shape (attempt ${retry ? 2 : 1})`, parsed);
    } catch (err) {
      console.warn(`[claude] analysis failed (attempt ${retry ? 2 : 1})`, err);
    }
  }

  // Fallback ladder: genre preset (or a neutral default if no song was picked).
  console.warn('[claude] falling back to genre preset — vision analysis unavailable');
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
