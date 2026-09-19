// Vision-analysis endpoints (plan §E). Frames arrive as base64 JPEG in JSON bodies (simplest
// path given express.json() is already in use elsewhere — no multer needed for this route).
import type { Request, Response } from 'express';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { analyzeVision, type AnalysisHints } from '../claude.ts';
import { broadcastToSession } from '../wsHub.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.resolve(__dirname, '..', '..', 'data');

function sessionFramesDir(session: string): string {
  const dir = path.join(dataDir, 'sessions', session, 'frames');
  mkdirSync(dir, { recursive: true });
  return dir;
}

function writeBase64Jpeg(dir: string, name: string, base64: string): string {
  const filePath = path.join(dir, name);
  writeFileSync(filePath, Buffer.from(base64, 'base64'));
  return name;
}

export async function analyzeQuick(req: Request, res: Response) {
  const { session, frame, hints } = req.body as { session?: string; frame?: string; hints?: AnalysisHints };
  if (!session || !frame) {
    res.status(400).json({ error: 'missing session or frame' });
    return;
  }

  try {
    const dir = sessionFramesDir(session);
    const fileName = writeBase64Jpeg(dir, 'quick.jpg', frame);
    const analysis = await analyzeVision(dir, [fileName], 'quick', hints ?? {});
    broadcastToSession(session, { type: 'quick-analysis', analysis });
    res.json(analysis);
  } catch (err) {
    console.error('[analyze] quick failed', err);
    res.status(502).json({ error: 'analysis failed' });
  }
}

export async function analyzeFull(req: Request, res: Response) {
  const { session, frames, hints } = req.body as { session?: string; frames?: string[]; hints?: AnalysisHints };
  if (!session || !frames || frames.length === 0) {
    res.status(400).json({ error: 'missing session or frames' });
    return;
  }

  try {
    const dir = sessionFramesDir(session);
    const fileNames = frames.map((b64, i) => writeBase64Jpeg(dir, `full_${i}.jpg`, b64));
    const analysis = await analyzeVision(dir, fileNames, 'full', hints ?? {});
    res.json(analysis);
  } catch (err) {
    console.error('[analyze] full failed', err);
    res.status(502).json({ error: 'analysis failed' });
  }
}
