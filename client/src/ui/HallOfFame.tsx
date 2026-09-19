// Persistent gallery of past art-battle champions (plan §L) — survives server restarts since
// it reads straight from gallery.json via the API, same as the live gallery.
import { useEffect, useState } from 'react';
import { getHallOfFame } from '../net/api.ts';
import type { GalleryEntry } from '@shared/types.ts';

export function HallOfFame() {
  const [champions, setChampions] = useState<GalleryEntry[] | null>(null);

  useEffect(() => {
    getHallOfFame()
      .then(setChampions)
      .catch((err) => {
        console.error('[halloffame] failed to load', err);
        setChampions([]);
      });
  }, []);

  return (
    <main style={{ padding: '2.5rem 1.5rem 3rem', minHeight: '100vh', textAlign: 'center' }}>
      <h1 style={{ fontSize: 32, margin: '0 0 4px' }}>👑 Salón de la Fama</h1>
      <p style={{ margin: '0 0 2rem', color: 'var(--ink-dim)', fontSize: 14 }}>Campeones de todas las fiestas</p>

      {champions === null && <p style={{ color: 'var(--ink-faint)' }}>Cargando…</p>}

      {champions?.length === 0 && (
        <p style={{ color: 'var(--ink-dim)' }}>Aún no hay campeones — ¡sé el primero en ganar una batalla de arte!</p>
      )}

      {champions && champions.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 20, justifyContent: 'center', maxWidth: 1000, margin: '0 auto' }}>
          {champions.map((c) => (
            <div key={c.id} className="card" style={{ width: 240, overflow: 'hidden', borderRadius: 20, textAlign: 'left' }}>
              {(c.files.champion ?? c.files.poster ?? c.files.painting) && (
                <img
                  src={c.files.champion ?? c.files.poster ?? c.files.painting}
                  alt={c.dancerName}
                  style={{ width: '100%', height: 260, objectFit: 'cover', display: 'block' }}
                />
              )}
              <div style={{ padding: '0.75rem 1rem' }}>
                <p style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>👑 {c.dancerName}</p>
                <p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--ink-dim)' }}>
                  {c.danceStyle} · {c.culture}
                </p>
                <p style={{ margin: '2px 0 0', fontSize: 11, color: 'var(--ink-faint)' }}>
                  {new Date(c.createdAt).toLocaleDateString('es')}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}

      <p style={{ marginTop: '2.5rem' }}>
        <a href="#/" style={{ color: 'var(--accent)', fontSize: 13 }}>← volver al inicio</a>
      </p>
    </main>
  );
}
