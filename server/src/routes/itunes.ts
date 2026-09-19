// iTunes Search API proxy (plan §D.1). No CORS, ~20 req/min rate limit — always proxy, cache,
// and debounce on the client. Also proxies the 30s preview audio so decodeAudioData works
// without a CORS-tainted buffer.
import type { Request, Response } from 'express';
import type { SongInfo } from '../../../shared/types.ts';

interface ITunesResult {
  trackName: string;
  artistName: string;
  primaryGenreName: string;
  artworkUrl100?: string;
  previewUrl?: string;
}

const searchCache = new Map<string, SongInfo[]>();

export async function searchSongs(req: Request, res: Response) {
  const term = String(req.query.term ?? '').trim();
  if (!term) {
    res.json([]);
    return;
  }

  const cached = searchCache.get(term);
  if (cached) {
    res.json(cached);
    return;
  }

  try {
    const url = `https://itunes.apple.com/search?term=${encodeURIComponent(term)}&media=music&entity=song&limit=8`;
    const r = await fetch(url);
    if (!r.ok) throw new Error(`itunes search failed: ${r.status}`);
    const data = (await r.json()) as { results: ITunesResult[] };

    const songs: SongInfo[] = data.results
      .filter((it) => !!it.previewUrl)
      .map((it) => ({
        title: it.trackName,
        artist: it.artistName,
        genre: it.primaryGenreName ?? '',
        artworkUrl: it.artworkUrl100?.replace('100x100', '600x600'),
        previewUrl: it.previewUrl,
      }));

    searchCache.set(term, songs);
    res.json(songs);
  } catch (err) {
    console.error('[itunes] search failed', err);
    res.status(502).json({ error: 'itunes search failed' });
  }
}

export async function proxyPreview(req: Request, res: Response) {
  const url = String(req.query.url ?? '');
  try {
    const parsed = new URL(url);
    // Apple serves 30s previews from several subdomains (audio-ssl.itunes.apple.com,
    // *.mzstatic.com, ...) — allow anything under apple.com or mzstatic.com rather than one
    // exact host, since that's what actually broke playback.
    const host = parsed.hostname;
    if (!(host.endsWith('.apple.com') || host === 'apple.com' || host.endsWith('.mzstatic.com'))) {
      res.status(400).json({ error: 'invalid preview host' });
      return;
    }
  } catch {
    res.status(400).json({ error: 'invalid url' });
    return;
  }

  try {
    const upstream = await fetch(url);
    if (!upstream.ok || !upstream.body) {
      res.status(502).json({ error: 'preview fetch failed' });
      return;
    }
    res.setHeader('content-type', upstream.headers.get('content-type') ?? 'audio/mp4');
    const reader = upstream.body.getReader();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      res.write(value);
    }
    res.end();
  } catch (err) {
    console.error('[itunes] preview proxy failed', err);
    res.status(502).json({ error: 'preview proxy failed' });
  }
}
