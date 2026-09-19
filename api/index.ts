// Vercel-hosted backend (plan §L addendum — see README's "Hosted deployment" section). One
// Express app, deployed as a single serverless function; see vercel.json's rewrite that routes
// every /api/* request here. This is a parallel implementation of server/index.ts's routes for
// the deployment target that can't hold a WebSocket server or in-memory state — it reuses the
// genuinely stateless pieces (iTunes proxy, Cloudflare painting) directly from server/src, and
// replaces everything stateful (gallery, battle, vision, realtime) with Redis/Blob/Pusher/
// Anthropic-backed equivalents. The LAN server (server/src) is unchanged and still the path for
// local `npm run dev` party mode.
import express from 'express';
import { searchSongs, proxyPreview } from '../server/src/routes/itunes.ts';
import { generatePainting } from '../server/src/routes/painting.ts';
import { analyzeQuick, analyzeFull } from './routes/analyze.ts';
import { createGalleryEntry, uploadArtifactBase64, recordArtifactUrl, getGallery, getHallOfFame } from './routes/gallery.ts';
import { getHostInfo } from './routes/hostInfo.ts';
import { pusherAuth, relay } from './routes/realtime.ts';
import { artifactUploadToken, videoUploadToken, uploadNotify } from './routes/blob.ts';

const app = express();
app.use(express.json({ limit: '4mb' }));

app.get('/api/health', (_req, res) => res.json({ ok: true }));

app.get('/api/itunes/search', searchSongs);
app.get('/api/itunes/preview', proxyPreview);
app.post('/api/analyze/quick', analyzeQuick);
app.post('/api/analyze/full', analyzeFull);
app.post('/api/generate-painting', generatePainting);

app.get('/api/gallery', getGallery);
app.post('/api/gallery', createGalleryEntry);
app.post('/api/gallery/:id/artifact/:name', uploadArtifactBase64);
app.post('/api/gallery/:id/artifact-url', recordArtifactUrl);
app.get('/api/halloffame', getHallOfFame);

app.get('/api/host-info', getHostInfo);

app.post('/api/pusher-auth', express.urlencoded({ extended: false }), pusherAuth);
app.post('/api/relay', relay);

app.post('/api/blob/artifact-upload', artifactUploadToken);
app.post('/api/blob/video-upload', videoUploadToken);
app.post('/api/upload-notify', uploadNotify);

export default app;
