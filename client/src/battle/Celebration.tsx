// Champion celebration (plan §L): confetti barrage + crown on the big screen. Fires once per
// champion — the parent only mounts this when a NEW championEntryId appears.
import { useEffect } from 'react';
import confetti from 'canvas-confetti';

interface Props {
  dancerName: string;
  imageUrl?: string;
  votes: number;
}

export function Celebration({ dancerName, imageUrl, votes }: Props) {
  useEffect(() => {
    const end = Date.now() + 2500;
    const colors = ['#f5c542', '#f2e5c8', '#ffffff'];
    (function frame() {
      confetti({ particleCount: 4, angle: 60, spread: 70, origin: { x: 0 }, colors });
      confetti({ particleCount: 4, angle: 120, spread: 70, origin: { x: 1 }, colors });
      if (Date.now() < end) requestAnimationFrame(frame);
    })();
    confetti({ particleCount: 140, spread: 100, origin: { y: 0.5 }, colors });
  }, []);

  return (
    <div style={{ textAlign: 'center', padding: '2rem 1rem' }}>
      <p style={{ fontSize: 56, margin: 0 }}>👑</p>
      <h2 style={{ fontSize: 30, margin: '4px 0' }}>{dancerName}</h2>
      <p style={{ fontSize: 16, color: 'var(--accent)', fontWeight: 600, margin: '0 0 1.5rem' }}>
        CAMPEÓN DE LA FIESTA · {votes} voto{votes === 1 ? '' : 's'}
      </p>
      {imageUrl && (
        <img
          src={imageUrl}
          alt={`Obra ganadora de ${dancerName}`}
          style={{ maxWidth: 320, width: '100%', borderRadius: 20, border: '4px solid #f5c542', boxShadow: 'var(--shadow-lg)' }}
        />
      )}
    </div>
  );
}
