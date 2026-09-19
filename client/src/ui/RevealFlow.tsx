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
      <div style={{ fontSize: 20, fontWeight: 700 }}>{value}</div>
      <div style={{ fontSize: 11, opacity: 0.6 }}>{label}</div>
    </div>
  );
}

export function RevealFlow({ stage, analysis, stats, paintingUrl, usingFallback }: Props) {
  return (
    <div style={{ maxWidth: 560, margin: '1.5rem auto', textAlign: 'center' }}>
      {stage === 'analyzing' && (
        <div style={{ padding: '3rem 0' }}>
          <div style={{ fontSize: 32, marginBottom: 8 }}>🔮</div>
          <p style={{ opacity: 0.8 }}>revelando tu obra…</p>
        </div>
      )}

      {(stage === 'painting' || stage === 'done') && paintingUrl && (
        <div
          key={paintingUrl}
          style={{
            animation: 'reveal-wipe-in 0.9s ease-out',
            borderRadius: 16,
            overflow: 'hidden',
            border: '1px solid rgba(255,255,255,0.15)',
            boxShadow: '0 8px 40px rgba(0,0,0,0.5)',
          }}
        >
          <img src={paintingUrl} alt="obra generada" style={{ width: '100%', display: 'block' }} />
        </div>
      )}

      {stage === 'painting' && !paintingUrl && (
        <p style={{ opacity: 0.7 }}>pintando…</p>
      )}

      {usingFallback && stage === 'done' && (
        <p style={{ opacity: 0.4, fontSize: 12, marginTop: 6 }}>
          (pintura de respaldo — Gemini no disponible en este momento)
        </p>
      )}

      {analysis && stage === 'done' && (
        <div style={{ marginTop: '1.25rem' }}>
          <p style={{ fontSize: 17, fontWeight: 700, margin: '0 0 4px' }}>
            {analysis.culture} · {analysis.danceStyle} · {analysis.mood}
          </p>
          <p style={{ opacity: 0.75, fontStyle: 'italic', fontSize: 14, margin: 0 }}>
            "{analysis.perceivedExperience}"
          </p>
        </div>
      )}

      {stats && stage === 'done' && (
        <div style={{ display: 'flex', justifyContent: 'center', gap: 20, marginTop: '1.25rem', flexWrap: 'wrap' }}>
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
      `}</style>
    </div>
  );
}
