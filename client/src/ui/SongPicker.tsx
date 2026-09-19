// Song selection: typed search (debounced), Surprise Me, or mic mode. See plan §D.
import { useEffect, useRef, useState } from 'react';
import type { SongInfo } from '@shared/types.ts';
import { searchSongs } from '../net/api.ts';
import { SURPRISE_PLAYLIST, pickRandomSong } from '@shared/playlist.ts';

interface Props {
  onSelect: (song: SongInfo) => void;
  onMicMode: () => void;
}

export function SongPicker({ onSelect, onMicMode }: Props) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SongInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [surprising, setSurprising] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (query.trim().length < 2) {
      setResults([]);
      return;
    }
    debounceRef.current = setTimeout(async () => {
      setLoading(true);
      try {
        setResults(await searchSongs(query));
      } catch (err) {
        console.error('[songpicker] search failed', err);
      } finally {
        setLoading(false);
      }
    }, 400);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [query]);

  async function handleSurprise() {
    setSurprising(true);
    try {
      // Try a few random picks in case one has no resolvable preview right now.
      for (let attempt = 0; attempt < 4; attempt++) {
        const entry = pickRandomSong();
        const found = await searchSongs(entry.search);
        if (found.length > 0) {
          onSelect(found[0]);
          return;
        }
      }
      console.warn('[songpicker] surprise me: no preview-playable result after 4 attempts');
    } finally {
      setSurprising(false);
    }
  }

  return (
    <div style={{ maxWidth: 480, margin: '0 auto', textAlign: 'center' }}>
      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Busca una canción o artista…"
        style={{ width: '100%', padding: '0.85rem 1.25rem', borderRadius: 999, fontSize: 16 }}
      />

      <div style={{ display: 'flex', gap: 10, justifyContent: 'center', margin: '1.1rem 0', flexWrap: 'wrap' }}>
        <button onClick={handleSurprise} disabled={surprising} style={{ padding: '0.55rem 1.25rem', borderRadius: 999, fontSize: 14 }}>
          {surprising ? 'Buscando…' : `🎲 Sorpréndeme (${SURPRISE_PLAYLIST.length} culturas)`}
        </button>
        <button onClick={onMicMode} style={{ padding: '0.55rem 1.25rem', borderRadius: 999, fontSize: 14 }}>
          🎤 Micrófono en vivo
        </button>
      </div>

      {loading && <p style={{ color: 'var(--ink-dim)', fontSize: 14 }}>Buscando…</p>}

      <ul style={{ listStyle: 'none', padding: 0, textAlign: 'left', display: 'flex', flexDirection: 'column', gap: 4 }}>
        {results.map((song, i) => (
          <li
            key={i}
            onClick={() => onSelect(song)}
            className="card"
            style={{ display: 'flex', gap: 12, alignItems: 'center', padding: '0.6rem 0.75rem', cursor: 'pointer', boxShadow: 'none' }}
            onMouseEnter={(e) => (e.currentTarget.style.borderColor = 'color-mix(in srgb, var(--accent) 50%, var(--border))')}
            onMouseLeave={(e) => (e.currentTarget.style.borderColor = 'var(--border)')}
          >
            {song.artworkUrl ? (
              <img src={song.artworkUrl} alt="" width={48} height={48} style={{ borderRadius: 8, flexShrink: 0 }} />
            ) : (
              <div style={{ width: 48, height: 48, borderRadius: 8, background: 'var(--c2)', flexShrink: 0 }} />
            )}
            <div style={{ minWidth: 0 }}>
              <div style={{ fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{song.title}</div>
              <div style={{ color: 'var(--ink-dim)', fontSize: 13 }}>{song.artist} · {song.genre}</div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
