// Thin fetch wrappers for /api/* — the client never talks to the server on any origin/port
// other than the one it was loaded from (Vite proxies /api -> 127.0.0.1:8787). See plan §A.
import type { DanceStats, GalleryEntry, SongInfo, VisionAnalysis } from '@shared/types.ts';

export async function searchSongs(term: string): Promise<SongInfo[]> {
  const res = await fetch(`/api/itunes/search?term=${encodeURIComponent(term)}`);
  if (!res.ok) throw new Error(`search failed: ${res.status}`);
  return res.json();
}

export interface AnalysisHints {
  songTitle?: string;
  artist?: string;
  genre?: string;
  bpm?: number;
  energyWord?: string;
  smoothnessWord?: string;
}

export async function analyzeQuick(session: string, frameBase64: string, hints: AnalysisHints): Promise<VisionAnalysis> {
  const res = await fetch('/api/analyze/quick', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ session, frame: frameBase64, hints }),
  });
  if (!res.ok) throw new Error(`analyze/quick failed: ${res.status}`);
  return res.json();
}

export async function analyzeFull(session: string, frames: string[], hints: AnalysisHints): Promise<VisionAnalysis> {
  const res = await fetch('/api/analyze/full', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ session, frames, hints }),
  });
  if (!res.ok) throw new Error(`analyze/full failed: ${res.status}`);
  return res.json();
}

export interface GeneratePaintingResult {
  fallback: boolean;
  imageBase64?: string;
}

export async function generatePainting(
  session: string,
  analysis: VisionAnalysis,
  stats: DanceStats,
  gesturePngBase64: string,
): Promise<GeneratePaintingResult> {
  const res = await fetch('/api/generate-painting', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ session, analysis, stats, gesturePngBase64 }),
  });
  if (!res.ok) throw new Error(`generate-painting failed: ${res.status}`);
  return res.json();
}

export async function createGalleryEntry(
  dancerName: string,
  song: SongInfo | null,
  analysis: VisionAnalysis,
  stats: DanceStats,
): Promise<GalleryEntry> {
  const res = await fetch('/api/gallery', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ dancerName, song, analysis, stats }),
  });
  if (!res.ok) throw new Error(`create gallery entry failed: ${res.status}`);
  return res.json();
}

export async function uploadGalleryArtifact(
  entryId: string,
  name: 'painting.png' | 'poster.png' | 'thumb.jpg' | 'sculpture.glb' | 'champion.png',
  base64: string,
): Promise<{ url: string }> {
  const res = await fetch(`/api/gallery/${entryId}/artifact/${name}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ base64 }),
  });
  if (!res.ok) throw new Error(`upload artifact failed: ${res.status}`);
  return res.json();
}

export async function getGallery(): Promise<GalleryEntry[]> {
  const res = await fetch('/api/gallery');
  if (!res.ok) throw new Error(`get gallery failed: ${res.status}`);
  return res.json();
}

export async function getHallOfFame(): Promise<GalleryEntry[]> {
  const res = await fetch('/api/halloffame');
  if (!res.ok) throw new Error(`get hall of fame failed: ${res.status}`);
  return res.json();
}

export async function getHealth(): Promise<{ ok: boolean }> {
  const res = await fetch('/api/health');
  if (!res.ok) throw new Error(`health check failed: ${res.status}`);
  return res.json();
}

export interface HostInfo {
  lanUrl: string;
}

export async function getHostInfo(): Promise<HostInfo> {
  const res = await fetch('/api/host-info');
  if (!res.ok) throw new Error(`host-info failed: ${res.status}`);
  return res.json();
}
