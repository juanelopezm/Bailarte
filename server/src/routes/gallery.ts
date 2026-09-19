// Gallery CRUD (plan §L). Artifacts (poster/painting/thumb PNGs, sculpture GLB) arrive as
// base64 in JSON bodies — consistent with the rest of the app, no multer needed.
import type { Request, Response } from 'express';
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { createEntry, updateEntryFiles, listEntries, listChampions, artifactsDir } from '../gallery.ts';
import type { DanceStats, SongInfo, VisionAnalysis } from '../../../shared/types.ts';

const ARTIFACT_NAMES = new Set(['painting.png', 'poster.png', 'thumb.jpg', 'sculpture.glb', 'champion.png']);

export function createGalleryEntry(req: Request, res: Response) {
  const body = req.body as {
    dancerName?: string;
    song?: SongInfo;
    analysis?: VisionAnalysis;
    stats?: DanceStats;
  };
  if (!body.dancerName || !body.analysis || !body.stats) {
    res.status(400).json({ error: 'missing dancerName, analysis, or stats' });
    return;
  }

  const entry = createEntry({
    dancerName: body.dancerName,
    song: body.song ?? { title: '', artist: '', genre: '' },
    culture: body.analysis.culture,
    danceStyle: body.analysis.danceStyle,
    mood: body.analysis.mood,
    palette: body.analysis.colorPalette,
    stats: body.stats,
  });
  res.json(entry);
}

export function uploadArtifact(req: Request, res: Response) {
  const id = String(req.params.id);
  const name = String(req.params.name);
  const { base64 } = req.body as { base64?: string };
  if (!ARTIFACT_NAMES.has(name)) {
    res.status(400).json({ error: 'invalid artifact name' });
    return;
  }
  if (!base64) {
    res.status(400).json({ error: 'missing base64' });
    return;
  }

  const filePath = path.join(artifactsDir, id, name);
  writeFileSync(filePath, Buffer.from(base64, 'base64'));

  const stem = name.replace(/\.(png|jpg|glb)$/, '') as 'painting' | 'poster' | 'thumb' | 'sculpture' | 'champion';
  const fileKey = stem === 'sculpture' ? 'sculptureGlb' : stem;
  const url = `/artifacts/${id}/${name}`;
  const updated = updateEntryFiles(id, { [fileKey]: url });
  if (!updated) {
    res.status(404).json({ error: 'entry not found' });
    return;
  }
  res.json({ url });
}

export function getGallery(_req: Request, res: Response) {
  res.json(listEntries());
}

export function getHallOfFame(_req: Request, res: Response) {
  res.json(listChampions());
}
