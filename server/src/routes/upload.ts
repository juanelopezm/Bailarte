// Phone video upload (plan §K) — the no-WebRTC fallback path. Base64 in a JSON body (same
// pattern as the rest of the app); saved to the session dir, then the host is notified over ws
// so it can run the offline processing pipeline (capture/offline.ts on the client).
import type { Request, Response } from 'express';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { broadcastToSession } from '../wsHub.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.resolve(__dirname, '..', '..', 'data');

export function uploadVideo(req: Request, res: Response) {
  const { session, name, base64 } = req.body as { session?: string; name?: string; base64?: string };
  if (!session || !name || !base64) {
    res.status(400).json({ error: 'missing session, name, or base64' });
    return;
  }

  const sessionDir = path.join(dataDir, 'sessions', session);
  mkdirSync(sessionDir, { recursive: true });
  const safeName = name.replace(/[^a-zA-Z0-9._-]/g, '_');
  const filePath = path.join(sessionDir, safeName);
  writeFileSync(filePath, Buffer.from(base64, 'base64'));

  const url = `/api/upload/${session}/${safeName}`;
  broadcastToSession(session, { type: 'upload-ready', url, name: safeName });
  res.json({ url });
}
