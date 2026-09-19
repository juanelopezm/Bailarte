// Gemini digital painting (plan §H). Isolated in its own file since this is the piece of the
// stack most likely to drift (model names, SDK shape) — everything else only calls `paint()`.
// Privacy: only the abstract gesture painting is ever sent here — never camera frames of the
// person (plan §E "privacy split").
import { GoogleGenAI } from '@google/genai';

let client: GoogleGenAI | null = null;

function getClient(): GoogleGenAI | null {
  if (!process.env.GEMINI_API_KEY) return null;
  if (!client) client = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  return client;
}

export function isGeminiConfigured(): boolean {
  return !!process.env.GEMINI_API_KEY;
}

/**
 * Sends the gesture-painting PNG (base64, no data-URI prefix) + a text prompt to Gemini's
 * image model. Returns the generated image as a Buffer, or null if unconfigured/unavailable
 * (caller falls back to promoting the hi-res replay to the "digital painting").
 */
export async function paintFromGesture(prompt: string, gesturePngBase64: string): Promise<Buffer | null> {
  const ai = getClient();
  if (!ai) return null;

  // Verified against the live API's /v1beta/models listing for this key: gemini-3.1-flash-image,
  // gemini-3-pro-image, gemini-3.1-flash-lite-image, and gemini-2.5-flash-image all exist, but
  // EVERY image model returns HTTP 429 "limit: 0" on a free-tier (no billing) API key — this is
  // a Google account-level gate, not a model-name issue. Enable billing on the Google AI Studio
  // project to unlock it; until then paint() returns null and the caller promotes the hi-res
  // replay to the "digital painting" instead (see plan §H fallback ladder).
  const model = process.env.GEMINI_IMAGE_MODEL || 'gemini-3.1-flash-image';
  try {
    const response = await ai.models.generateContent({
      model,
      contents: [
        {
          role: 'user',
          parts: [
            { text: prompt },
            { inlineData: { mimeType: 'image/png', data: gesturePngBase64 } },
          ],
        },
      ],
    });

    const base64 = response.data;
    if (!base64) {
      console.warn('[gemini] response had no inline image data', response.text?.slice(0, 200));
      return null;
    }
    return Buffer.from(base64, 'base64');
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (message.includes('RESOURCE_EXHAUSTED') || message.includes('limit: 0')) {
      console.warn(
        '[gemini] image generation quota is 0 on this API key\'s free tier (this is an account ' +
        'billing gate, not a bug) — enable billing at https://aistudio.google.com to unlock it. ' +
        'Falling back to the hi-res replay for now.',
      );
    } else {
      console.error('[gemini] generateContent failed', err);
    }
    return null;
  }
}
