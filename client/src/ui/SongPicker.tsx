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
        style={{ width: '100%', padding: '0.75rem 1rem', borderRadius: 999, border: '1px solid #444', background: '#1a1a1a', color: '#eee', fontSize: 16 }}
      />

      <div style={{ display: 'flex', gap: 12, justifyContent: 'center', margin: '1rem 0' }}>
        <button onClick={handleSurprise} disabled={surprising} style={{ padding: '0.5rem 1.25rem', borderRadius: 999 }}>
          {surprising ? 'Buscando…' : `🎲 Sorpréndeme (${SURPRISE_PLAYLIST.length} culturas)`}
        </button>
        <button onClick={onMicMode} style={{ padding: '0.5rem 1.25rem', borderRadius: 999 }}>
          🎤 Reproducir en vivo (micrófono)
        </button>
      </div>

      {loading && <p style={{ opacity: 0.6 }}>Buscando…</p>}

      <ul style={{ listStyle: 'none', padding: 0, textAlign: 'left' }}>
        {results.map((song, i) => (
          <li
            key={i}
            onClick={() => onSelect(song)}
            style={{ display: 'flex', gap: 12, alignItems: 'center', padding: '0.5rem', cursor: 'pointer', borderRadius: 8 }}
            onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(255,255,255,0.08)')}
            onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
          >
            {song.artworkUrl && <img src={song.artworkUrl} alt="" width={48} height={48} style={{ borderRadius: 6 }} />}
            <div>
              <div>{song.title}</div>
              <div style={{ opacity: 0.6, fontSize: 13 }}>{song.artist} · {song.genre}</div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
