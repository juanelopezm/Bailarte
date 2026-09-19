// Digital painting via Cloudflare Workers AI (replaces Gemini — see README "Known limitations":
// Gemini's image models require a billed Google Cloud project even on a "free tier" API key;
// Cloudflare Workers AI has a genuinely free daily quota with no card required).
//
// Verified against live docs 2026-09-19: model @cf/black-forest-labs/flux-1-schnell only takes
// a text prompt (no image input) — unlike Gemini, we can't hand it the gesture-painting PNG as
// a base to refine. The prompt below is fully descriptive in words instead.
const MODEL = process.env.CLOUDFLARE_IMAGE_MODEL || '@cf/black-forest-labs/flux-1-schnell';

export function isCloudflareConfigured(): boolean {
  return !!(process.env.CLOUDFLARE_ACCOUNT_ID && process.env.CLOUDFLARE_API_TOKEN);
}

/**
 * Generates an image purely from a text prompt. Returns null if unconfigured or the request
 * fails (caller falls back to promoting the hi-res replay to the "digital painting").
 */
export async function paintFromPrompt(prompt: string): Promise<Buffer | null> {
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
  const token = process.env.CLOUDFLARE_API_TOKEN;
  if (!accountId || !token) return null;

  // Model limit is 1-2048 chars.
  const truncated = prompt.length > 2000 ? prompt.slice(0, 2000) : prompt;

  try {
    const res = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run/${MODEL}`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'content-type': 'application/json' },
        body: JSON.stringify({ prompt: truncated, steps: 8 }),
      },
    );

    const data = (await res.json()) as { result?: { image?: string }; image?: string };
    const base64 = data.result?.image ?? data.image;
    if (!res.ok || !base64) {
      console.warn('[cloudflare] image generation failed', JSON.stringify(data).slice(0, 500));
      return null;
    }
    return Buffer.from(base64, 'base64');
  } catch (err) {
    console.error('[cloudflare] request failed', err);
    return null;
  }
}
