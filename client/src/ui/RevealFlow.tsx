// Staged reveal (plan §H/§J, DELIGHT #3): freeze -> "developing..." -> painting wipe-in ->
// stats card. Purely presentational — StageScreen owns the actual pipeline orchestration.
import type { DanceStats, VisionAnalysis } from '@shared/types.ts';

export type RevealStage = 'analyzing' | 'painting' | 'done';

interface Props {
  stage: RevealStage;
  analysis: VisionAnalysis | null;
  stats: DanceStats | null;
  paintingUrl: string | null;
  usingFallback: boolean;
}

function StatChip({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ textAlign: 'center', minWidth: 70 }}>
      <div style={{ fontSize: 22, fontWeight: 700, fontFamily: 'var(--font-display)', color: 'var(--accent)' }}>{value}</div>
      <div style={{ fontSize: 11, color: 'var(--ink-faint)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{label}</div>
    </div>
  );
}

export function RevealFlow({ stage, analysis, stats, paintingUrl, usingFallback }: Props) {
  return (
    <div style={{ maxWidth: 560, margin: '1.5rem auto', textAlign: 'center', padding: '0 1rem' }}>
      {stage === 'analyzing' && (
        <div style={{ padding: '3rem 0' }}>
          <div style={{ fontSize: 36, marginBottom: 10, animation: 'spin-slow 3s linear infinite', display: 'inline-block' }}>🔮</div>
          <p style={{ color: 'var(--ink-dim)', fontSize: 15 }}>revelando tu obra…</p>
        </div>
      )}

      {(stage === 'painting' || stage === 'done') && paintingUrl && (
        <div
          key={paintingUrl}
          className="card"
          style={{
            animation: 'reveal-wipe-in 0.9s ease-out',
            overflow: 'hidden',
            boxShadow: 'var(--shadow-lg)',
          }}
        >
          <img src={paintingUrl} alt="obra generada" style={{ width: '100%', display: 'block' }} />
        </div>
      )}

      {stage === 'painting' && !paintingUrl && (
        <p style={{ color: 'var(--ink-dim)' }}>pintando…</p>
      )}

      {usingFallback && stage === 'done' && (
        <p style={{ color: 'var(--ink-faint)', fontSize: 12, marginTop: 8 }}>
          (pintura de respaldo — la IA de imágenes no está disponible en este momento)
        </p>
      )}

      {analysis && stage === 'done' && (
        <div style={{ marginTop: '1.5rem' }}>
          <p style={{ fontFamily: 'var(--font-display)', fontSize: 20, fontWeight: 600, margin: '0 0 6px' }}>
            {analysis.culture} · {analysis.danceStyle} · {analysis.mood}
          </p>
          <p style={{ color: 'var(--ink-dim)', fontStyle: 'italic', fontSize: 15, margin: 0 }}>
            "{analysis.perceivedExperience}"
          </p>
        </div>
      )}

      {stats && stage === 'done' && (
        <div className="card" style={{ display: 'flex', justifyContent: 'center', gap: 22, marginTop: '1.5rem', padding: '1rem 0.5rem', flexWrap: 'wrap' }}>
          <StatChip label="duración" value={`${(stats.durationMs / 1000).toFixed(0)}s`} />
          <StatChip label="BPM" value={stats.bpm > 0 ? String(stats.bpm) : '—'} />
          <StatChip label="metros" value={stats.wristTravelMeters.toFixed(1)} />
          <StatChip label="saltos" value={String(stats.jumps)} />
          <StatChip label="giros" value={String(stats.spins)} />
          <StatChip label="sincronía" value={`${Math.round(stats.grooveSyncPct * 100)}%`} />
        </div>
      )}

      <style>{`
        @keyframes reveal-wipe-in {
          from { clip-path: inset(0 100% 0 0); opacity: 0.3; }
          to { clip-path: inset(0 0 0 0); opacity: 1; }
        }
        @keyframes spin-slow {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}
