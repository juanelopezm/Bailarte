// Vercel-hosted backend (plan §L addendum — see README's "Hosted deployment" section). One
// Express app, deployed as a single serverless function; see vercel.json's rewrite that routes
// every /api/* request here. This is a parallel implementation of server/index.ts's routes for
// the deployment target that can't hold a WebSocket server or in-memory state, replacing
// everything stateful (gallery, battle, vision, realtime) with Redis/Blob/Pusher/Cloudflare-
// backed equivalents. The LAN server (server/src) is unchanged and still the path for local
// `npm run dev` party mode.
//
// Two Vercel-specific gotchas baked into this layout, both confirmed live 2026-09-19:
// 1. _routes/itunes.ts and _routes/painting.ts + _lib/cloudflareImage.ts are near-identical
//    copies of their server/src counterparts, not cross-imports — Vercel's Node.js function
//    builder only transpiles/bundles files within api/'s own workspace; a file imported from a
//    sibling npm workspace (server/) that isn't a declared dependency gets silently dropped from
//    the deployment and crashes every route at import time (ERR_MODULE_NOT_FOUND at runtime, no
//    build-time warning). shared/ is fine to cross-import — it's a plain folder, not its own
//    workspace, and every route here already depends on it.
// 2. Helper files live under _lib/ and _routes/ (underscore prefix), not lib/ and routes/ —
//    Vercel's zero-config routing turns EVERY file directly reachable under api/ into its own
//    serverless function route, with no distinction between "a route" and "a helper module".
//    Without the underscore prefix this repo hit "No more than 12 Serverless Functions" on the
//    Hobby plan from helper files alone, on top of not being the single-Express-app deploy this
//    file is written for. Underscore-prefixed files/directories are excluded from that routing.
import express from 'express';
import { searchSongs, proxyPreview } from './routes/itunes.ts';
import { generatePainting } from './routes/painting.ts';
import { analyzeQuick, analyzeFull } from './routes/analyze.ts';
import { createGalleryEntry, uploadArtifactBase64, recordArtifactUrl, getGallery, getHallOfFame } from './routes/gallery.ts';
import { getHostInfo } from './routes/hostInfo.ts';
import { pusherAuth, relay } from './routes/realtime.ts';
import { artifactUploadToken, videoUploadToken, uploadNotify } from './routes/blob.ts';
import { rateLimitAi } from './lib/ratelimit.ts';

const app = express();
app.use(express.json({ limit: '4mb' }));

app.get('/api/health', (_req, res) => res.json({ ok: true }));

app.get('/api/itunes/search', searchSongs);
app.get('/api/itunes/preview', proxyPreview);
// These three call Cloudflare Workers AI, which is billed as a 10,000/day quota shared across
// the whole account — see ratelimit.ts for why they're the ones gated.
app.post('/api/analyze/quick', rateLimitAi, analyzeQuick);
app.post('/api/analyze/full', rateLimitAi, analyzeFull);
app.post('/api/generate-painting', rateLimitAi, generatePainting);

app.get('/api/gallery', getGallery);
app.post('/api/gallery', createGalleryEntry);
app.post('/api/gallery/:id/artifact/:name', uploadArtifactBase64);
app.post('/api/gallery/:id/artifact-url', recordArtifactUrl);
app.get('/api/halloffame', getHallOfFame);

app.get('/api/host-info', getHostInfo);

// The client uses a customHandler (see net/realtime.ts) that POSTs JSON, not Pusher's default
// form-encoded ajax auth transport — the global express.json() middleware above already covers it.
app.post('/api/pusher-auth', pusherAuth);
app.post('/api/relay', relay);

app.post('/api/blob/artifact-upload', artifactUploadToken);
app.post('/api/blob/video-upload', videoUploadToken);
app.post('/api/upload-notify', uploadNotify);

export default app;
