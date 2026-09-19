// Thin fetch wrappers for /api/* — the client never talks to the server on any origin/port
// other than the one it was loaded from (Vite proxies /api -> 127.0.0.1:8787). See plan §A.
import type { SongInfo } from '@shared/types.ts';

export async function searchSongs(term: string): Promise<SongInfo[]> {
  const res = await fetch(`/api/itunes/search?term=${encodeURIComponent(term)}`);
  if (!res.ok) throw new Error(`search failed: ${res.status}`);
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
