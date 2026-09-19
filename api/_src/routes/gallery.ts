// Gallery CRUD (plan §L), serverless port of server/src/routes/gallery.ts — same shape, backed
// by galleryStore.ts (Redis + Blob) instead of a local JSON file + disk artifacts.
import type { Request, Response } from 'express';
import {
  createEntry, uploadArtifact, updateEntryFiles, listEntries, listChampions,
} from '../lib/galleryStore.ts';
import { isNonEmptyString, isOptionalString, isHexColor, isFiniteNumberInRange, isValidEntryId, isOwnBlobUrl } from '../lib/validate.ts';
import type { DanceStats, SongInfo, VisionAnalysis } from '../../../shared/types.ts';

const ARTIFACT_NAMES = new Set(['painting.png', 'poster.png', 'thumb.jpg', 'sculpture.glb', 'champion.png']);

function validStats(s: unknown): s is DanceStats {
  if (!s || typeof s !== 'object') return false;
  const st = s as Record<string, unknown>;
  return (
    isFiniteNumberInRange(st.durationMs, 0, 3_600_000) &&
    isFiniteNumberInRange(st.bpm, 0, 400) &&
    isFiniteNumberInRange(st.wristTravelMeters, 0, 100_000) &&
    isFiniteNumberInRange(st.jumps, 0, 100_000) &&
    isFiniteNumberInRange(st.spins, 0, 100_000) &&
    isFiniteNumberInRange(st.peakMomentMs, 0, 3_600_000) &&
    isFiniteNumberInRange(st.smoothness, 0, 1) &&
    isFiniteNumberInRange(st.grooveSyncPct, 0, 1)
  );
}

function validAnalysis(a: unknown): a is VisionAnalysis {
  if (!a || typeof a !== 'object') return false;
  const an = a as Record<string, unknown>;
  return (
    isNonEmptyString(an.culture, 200) &&
    isNonEmptyString(an.danceStyle, 200) &&
    isNonEmptyString(an.mood, 200) &&
    Array.isArray(an.colorPalette) &&
    an.colorPalette.length > 0 &&
    an.colorPalette.length <= 10 &&
    an.colorPalette.every((c) => isHexColor(c))
  );
}

function validSong(s: unknown): s is SongInfo {
  if (s === undefined) return true;
  if (!s || typeof s !== 'object') return false;
  const so = s as Record<string, unknown>;
  return isOptionalString(so.title, 300) && isOptionalString(so.artist, 300) && isOptionalString(so.genre, 100);
}

export async function createGalleryEntry(req: Request, res: Response) {
  const body = req.body as { dancerName?: string; song?: SongInfo; analysis?: VisionAnalysis; stats?: DanceStats };
  if (!isNonEmptyString(body.dancerName, 60) || !validAnalysis(body.analysis) || !validStats(body.stats) || !validSong(body.song)) {
    res.status(400).json({ error: 'invalid dancerName, song, analysis, or stats' });
    return;
  }
  const entry = await createEntry({
    dancerName: body.dancerName.trim(),
    song: body.song ?? { title: '', artist: '', genre: '' },
    culture: body.analysis.culture,
    danceStyle: body.analysis.danceStyle,
    mood: body.analysis.mood,
    palette: body.analysis.colorPalette,
    stats: body.stats,
  });
  res.json(entry);
}

// Small-payload path (base64 JSON body) — used directly for the LAN server's equivalent route,
// kept here too for anything small enough to not need the Blob client-upload path.
export async function uploadArtifactBase64(req: Request, res: Response) {
  const id = String(req.params.id);
  const name = String(req.params.name);
  const { base64 } = req.body as { base64?: string };
  if (!isValidEntryId(id)) {
    res.status(400).json({ error: 'invalid entry id' });
    return;
  }
  if (!ARTIFACT_NAMES.has(name)) {
    res.status(400).json({ error: 'invalid artifact name' });
    return;
  }
  if (!isNonEmptyString(base64, 6_000_000)) {
    res.status(400).json({ error: 'missing or oversized base64' });
    return;
  }
  const url = await uploadArtifact(id, name, base64);
  if (!url) {
    res.status(400).json({ error: 'invalid artifact name' });
    return;
  }
  res.json({ url });
}

// Records a URL that the client already uploaded directly to Blob storage (see
// net/api.ts's hosted branch of uploadGalleryArtifact) — this only ever carries a tiny JSON
// body, never the artifact bytes themselves.
export async function recordArtifactUrl(req: Request, res: Response) {
  const id = String(req.params.id);
  const { name, url } = req.body as { name?: string; url?: string };
  if (!isValidEntryId(id)) {
    res.status(400).json({ error: 'invalid entry id' });
    return;
  }
  if (!name || !ARTIFACT_NAMES.has(name) || !isOwnBlobUrl(url)) {
    res.status(400).json({ error: 'invalid name or url' });
    return;
  }
  const stem = name.replace(/\.(png|jpg|glb)$/, '') as 'painting' | 'poster' | 'thumb' | 'sculpture' | 'champion';
  const fileKey = stem === 'sculpture' ? 'sculptureGlb' : stem;
  const updated = await updateEntryFiles(id, { [fileKey]: url });
  if (!updated) {
    res.status(404).json({ error: 'entry not found' });
    return;
  }
  res.json({ url });
}

export async function getGallery(_req: Request, res: Response) {
  res.json(await listEntries());
}

export async function getHallOfFame(_req: Request, res: Response) {
  res.json(await listChampions());
}
