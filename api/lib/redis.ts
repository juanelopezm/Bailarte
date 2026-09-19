// Upstash Redis client (plan §L persistence, adapted for serverless — see gallery/battle
// stores). @vercel/kv is deprecated in favor of connecting Upstash directly via the Vercel
// Marketplace integration, which injects UPSTASH_REDIS_REST_URL/TOKEN automatically.
import { Redis } from '@upstash/redis';

export const redis = Redis.fromEnv();
