import './env.ts';
import express from 'express';
import { createServer } from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';
import { initHub } from './wsHub.ts';
import { searchSongs, proxyPreview } from './routes/itunes.ts';
import { analyzeQuick, analyzeFull } from './routes/analyze.ts';
import { generatePainting } from './routes/painting.ts';
import { createGalleryEntry, uploadArtifact, getGallery, getHallOfFame } from './routes/gallery.ts';
import { getHostInfo } from './routes/hostInfo.ts';
import { uploadVideo } from './routes/upload.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.resolve(__dirname, '..', 'data');

const app = express();
// 200mb: phone video uploads (plan §K, base64 overhead included) are the largest payload here.
app.use(express.json({ limit: '200mb' }));

app.get('/api/health', (_req, res) => {
  res.json({ ok: true });
});

app.get('/api/itunes/search', searchSongs);
app.get('/api/itunes/preview', proxyPreview);
app.post('/api/analyze/quick', analyzeQuick);
app.post('/api/analyze/full', analyzeFull);
app.post('/api/generate-painting', generatePainting);
app.get('/api/gallery', getGallery);
app.post('/api/gallery', createGalleryEntry);
app.post('/api/gallery/:id/artifact/:name', uploadArtifact);
app.get('/api/halloffame', getHallOfFame);
app.get('/api/host-info', getHostInfo);
app.post('/api/upload', uploadVideo);
app.use('/api/upload', express.static(path.join(dataDir, 'sessions')));

// Static-served artifacts (posters, paintings, sculpture exports) — see plan §L.
app.use('/artifacts', express.static(path.join(dataDir, 'artifacts')));

const server = createServer(app);
const wss = new WebSocketServer({ server, path: '/ws' });
initHub(wss);

const PORT = 8787;
server.listen(PORT, '127.0.0.1', () => {
  console.log(`[server] http://127.0.0.1:${PORT} (bound to loopback; Vite proxies /api and /ws)`);
});
