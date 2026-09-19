import './env.ts';
import express from 'express';
import { createServer } from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';
import { initHub } from './wsHub.ts';
import { searchSongs, proxyPreview } from './routes/itunes.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.resolve(__dirname, '..', 'data');

const app = express();
app.use(express.json({ limit: '2mb' }));

app.get('/api/health', (_req, res) => {
  res.json({ ok: true });
});

app.get('/api/itunes/search', searchSongs);
app.get('/api/itunes/preview', proxyPreview);

// Static-served artifacts (posters, paintings, sculpture exports) — see plan §L.
app.use('/artifacts', express.static(path.join(dataDir, 'artifacts')));

const server = createServer(app);
const wss = new WebSocketServer({ server, path: '/ws' });
initHub(wss);

const PORT = 8787;
server.listen(PORT, '127.0.0.1', () => {
  console.log(`[server] http://127.0.0.1:${PORT} (bound to loopback; Vite proxies /api and /ws)`);
});
