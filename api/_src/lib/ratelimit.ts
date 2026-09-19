// Per-IP rate limiting for the routes that call Cloudflare Workers AI (plan hardening pass).
// Cloudflare's free tier is a 10,000 neurons/day quota shared across the WHOLE account, not
// per-request — a bug that retry-loops, or someone hammering the public URL directly, could
// burn through an entire party's daily quota before anyone even starts dancing. Only these
// routes need it: everything else here is either free (Redis/Blob reads, iTunes proxy) or
// naturally self-limiting (a human tapping vote buttons).
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

export function clientIp(req: Request): string {
  const forwarded = req.headers['x-forwarded-for'];
  const first = Array.isArray(forwarded) ? forwarded[0] : forwarded?.split(',')[0];
  return first?.trim() || req.socket.remoteAddress || 'unknown';
}

export async function rateLimitAi(req: Request, res: Response, next: NextFunction) {
  const { success, remaining, reset } = await aiRateLimit.limit(clientIp(req));
  if (!success) {
    res.status(429).json({
      error: 'rate limit exceeded — too many AI requests from this network, try again shortly',
      retryAfterMs: Math.max(0, reset - Date.now()),
    });
    return;
  }
  res.setHeader('x-ratelimit-remaining', String(remaining));
  next();
}
