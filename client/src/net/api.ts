// Thin fetch wrappers for /api/* — the client never talks to the server on any origin/port
// other than the one it was loaded from (Vite proxies /api -> 127.0.0.1:8787). See plan §A.
import { upload as blobUpload } from '@vercel/blob/client';
import { isHosted } from './transport.ts';
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
): Promise<GeneratePaintingResult> {
  const res = await fetch('/api/generate-painting', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ session, analysis, stats }),
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

const ARTIFACT_CONTENT_TYPES = {
  'painting.png': 'image/png',
  'poster.png': 'image/png',
  'thumb.jpg': 'image/jpeg',
  'sculpture.glb': 'model/gltf-binary',
  'champion.png': 'image/png',
} as const;

export async function uploadGalleryArtifact(
  entryId: string,
  name: keyof typeof ARTIFACT_CONTENT_TYPES,
  base64: string,
): Promise<{ url: string }> {
  if (isHosted) {
    // A hi-res painting/poster PNG (or a GLB) can exceed a serverless function's ~4.5MB request
    // body — go straight from the browser to Blob storage instead of through /api/gallery/*.
    const blobRes = await fetch(`data:${ARTIFACT_CONTENT_TYPES[name]};base64,${base64}`);
    const blob = await blobRes.blob();
    const result = await blobUpload(`gallery/${entryId}/${name}`, blob, {
      access: 'public',
      handleUploadUrl: '/api/blob/artifact-upload',
    });
    const res = await fetch(`/api/gallery/${entryId}/artifact-url`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name, url: result.url }),
    });
    if (!res.ok) throw new Error(`record artifact url failed: ${res.status}`);
    return { url: result.url };
  }

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
  lanUrl: string | null;
}

export async function getHostInfo(): Promise<HostInfo> {
  const res = await fetch('/api/host-info');
  if (!res.ok) throw new Error(`host-info failed: ${res.status}`);
  return res.json();
}

function readFileAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(',')[1] ?? '');
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export async function uploadVideo(session: string, file: File): Promise<{ url: string }> {
  if (isHosted) {
    // Up to ~200MB — nowhere near a serverless function's request body limit, so this goes
    // straight to Blob storage as the raw file (no base64 round-trip, unlike the artifact path).
    const result = await blobUpload(`uploads/${session}/${file.name}`, file, {
      access: 'public',
      handleUploadUrl: '/api/blob/video-upload',
    });
    const res = await fetch('/api/upload-notify', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ session, name: file.name, url: result.url }),
    });
    if (!res.ok) throw new Error(`upload-notify failed: ${res.status}`);
    return { url: result.url };
  }

  const base64 = await readFileAsBase64(file);
  const res = await fetch('/api/upload', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ session, name: file.name, base64 }),
  });
  if (!res.ok) throw new Error(`upload failed: ${res.status}`);
  return res.json();
}
