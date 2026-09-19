// Per-IP rate limiting (plan hardening pass). Two tiers:
// - `rateLimitAi`: tight, for routes that call Cloudflare Workers AI. Cloudflare's free tier is
//   a 10,000 neurons/day quota shared across the WHOLE account, not per-request — a bug that
//   retry-loops, or someone hammering the public URL directly, could burn through an entire
//   party's daily quota before anyone even starts dancing.
// - `rateLimitGeneral`: looser, for the gallery/hall-of-fame routes — cheap Redis/Blob
//   operations with no external quota at stake, but still unauthenticated and publicly
//   reachable, so still worth capping against scraping or spam entries.
import type { Request, Response, NextFunction } from 'express';
import { Ratelimit } from '@upstash/ratelimit';
import { redis } from './redis.ts';

// Generous for real usage (one dance needs exactly one call to each of these), tight enough
// that a retry loop or drive-by abuse can't do real damage before it 429s.
const aiRateLimit = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(10, '1 m'),
  prefix: 'ratelimit:ai',
});

const generalRateLimit = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(60, '1 m'),
  prefix: 'ratelimit:general',
});

export function clientIp(req: Request): string {
  const forwarded = req.headers['x-forwarded-for'];
  const first = Array.isArray(forwarded) ? forwarded[0] : forwarded?.split(',')[0];
  return first?.trim() || req.socket.remoteAddress || 'unknown';
}

function makeMiddleware(limiter: Ratelimit, message: string) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const { success, remaining, reset } = await limiter.limit(clientIp(req));
    if (!success) {
      res.status(429).json({ error: message, retryAfterMs: Math.max(0, reset - Date.now()) });
      return;
    }
    res.setHeader('x-ratelimit-remaining', String(remaining));
    next();
  };
}

export const rateLimitAi = makeMiddleware(
  aiRateLimit,
  'rate limit exceeded — too many AI requests from this network, try again shortly',
);
export const rateLimitGeneral = makeMiddleware(
  generalRateLimit,
  'rate limit exceeded — too many requests from this network, try again shortly',
);
