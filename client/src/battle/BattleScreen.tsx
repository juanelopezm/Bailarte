// Big-screen head-to-head art battle view (plan §L): VS layout, animated tally bars, countdown,
// bracket progression, tie coin-flip, and the champion celebration.
import { useEffect, useRef, useState } from 'react';
import { WsClient, getStoredStageSessionCode } from '../net/ws.ts';
import { QRJoin } from '../ui/QRJoin.tsx';
import { getGallery, uploadGalleryArtifact } from '../net/api.ts';
import { composePoster, canvasToBlob } from '../poster/composePoster.ts';
import { Celebration } from './Celebration.tsx';
import type { BattleMatch, BattleState, GalleryEntry, VisionAnalysis } from '@shared/types.ts';

interface Tally { matchId: string; a: number; b: number; voters: number }

async function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(',')[1] ?? '');
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

export function BattleScreen() {
  const [sessionCode] = useState(getStoredStageSessionCode);
  const [connected, setConnected] = useState(false);
  const [voterCount, setVoterCount] = useState(0);
  const [battleState, setBattleState] = useState<BattleState | null>(null);
  const [liveTally, setLiveTally] = useState<Tally | null>(null);
  const [now, setNow] = useState(Date.now());
  const [tieToast, setTieToast] = useState(false);
  const [championEntry, setChampionEntry] = useState<GalleryEntry | null>(null);
  const clientRef = useRef<WsClient | null>(null);
  const tallyByMatchRef = useRef<Map<string, Tally>>(new Map());
  const prevMatchesRef = useRef<Map<string, BattleMatch>>(new Map());
  const championPostedRef = useRef<string | null>(null);

  useEffect(() => {
    if (!sessionCode) return;
    const client = new WsClient();
    clientRef.current = client;
    const offConn = client.onConnectionChange((c) => {
      setConnected(c);
      if (c) client.send({ type: 'join', session: sessionCode, role: 'host' });
    });
    const offMsg = client.onMessage((msg) => {
      if (msg.type === 'joined') setVoterCount(0);
      else if (msg.type === 'peer-joined' && msg.role === 'voter') setVoterCount((n) => n + 1);
      else if (msg.type === 'peer-left' && msg.role === 'voter') setVoterCount((n) => Math.max(0, n - 1));
      else if (msg.type === 'tally') {
        const t = { matchId: msg.matchId, a: msg.a, b: msg.b, voters: msg.voters };
        tallyByMatchRef.current.set(msg.matchId, t);
        setLiveTally(t);
      } else if (msg.type === 'battle-state') {
        // Tie detection: diff against the previous snapshot to catch the exact moment a match
        // finishes as a tie, so the toast fires once instead of on every later state broadcast.
        for (const m of msg.state.matches) {
          const prev = prevMatchesRef.current.get(m.id);
          if (m.status === 'done' && m.tie && prev?.status !== 'done') {
            setTieToast(true);
            setTimeout(() => setTieToast(false), 2500);
          }
        }
        prevMatchesRef.current = new Map(msg.state.matches.map((m) => [m.id, m]));
        setBattleState(msg.state);
      }
    });
    client.connect();
    return () => { offConn(); offMsg(); client.close(); };
  }, [sessionCode]);

  const currentMatch: BattleMatch | null = battleState
    ? battleState.matches.find((m) => m.id === battleState.currentMatchId) ?? null
    : null;

  useEffect(() => {
    if (!currentMatch?.endsAt) return;
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, [currentMatch?.endsAt]);

  // Fetch the champion's full gallery entry, and build+save the champion-edition poster —
  // exactly once per championEntryId (plan §L: "champion poster saved to gallery").
  useEffect(() => {
    const championId = battleState?.championEntryId;
    if (!championId || championPostedRef.current === championId) return;
    championPostedRef.current = championId;

    (async () => {
      const entries = await getGallery();
      const entry = entries.find((e) => e.id === championId) ?? null;
      setChampionEntry(entry);
      if (!entry?.files.painting) return;

      const finalRound = Math.max(...(battleState?.matches.map((m) => m.round) ?? [1]));
      const finalMatch = battleState?.matches.find((m) => m.round === finalRound);
      const votes = finalMatch ? tallyByMatchRef.current.get(finalMatch.id)?.voters ?? 0 : 0;

      const analysisForPoster: VisionAnalysis = {
        culture: entry.culture,
        danceStyle: entry.danceStyle,
        mood: entry.mood,
        colorPalette: entry.palette,
        artStyleReferences: [],
        perceivedExperience: '',
        movementKeywords: [],
        fromVision: true,
      };
      try {
        const canvas = await composePoster({
          paintingUrl: entry.files.painting,
          analysis: analysisForPoster,
          song: entry.song,
          stats: entry.stats,
          dancerName: entry.dancerName,
          variant: 'champion',
          votes,
        });
        const base64 = await blobToBase64(await canvasToBlob(canvas));
        await uploadGalleryArtifact(entry.id, 'champion.png', base64);
      } catch (err) {
        console.error('[battle] champion poster generation failed', err);
      }
    })();
  }, [battleState]);

  function lockNow() {
    clientRef.current?.send({ type: 'battle-lock' });
  }

  if (!sessionCode) {
    return (
      <main style={{ padding: '3rem 1.5rem', minHeight: '100vh', textAlign: 'center' }}>
        <h1 style={{ fontSize: 30 }}>Batalla de Arte</h1>
        <p style={{ color: 'var(--ink-dim)' }}>No hay una sesión activa. Vuelve al inicio y guarda al menos 2 obras.</p>
        <a href="#/" style={{ color: 'var(--accent)' }}>← volver</a>
      </main>
    );
  }

  const championId = battleState?.championEntryId ?? null;
  const finalMatch = championId && battleState
    ? battleState.matches.find((m) => m.round === Math.max(...battleState.matches.map((x) => x.round)))
    : null;
  const championVotes = finalMatch ? tallyByMatchRef.current.get(finalMatch.id)?.voters ?? 0 : 0;

  const totalVotes = liveTally && currentMatch && liveTally.matchId === currentMatch.id ? liveTally.a + liveTally.b : 0;
  const pctA = totalVotes > 0 && liveTally ? Math.round((liveTally.a / totalVotes) * 100) : 0;
  const pctB = totalVotes > 0 && liveTally ? 100 - pctA : 0;
  const secondsLeft = currentMatch?.endsAt ? Math.max(0, Math.ceil((currentMatch.endsAt - now) / 1000)) : null;

  const rounds = battleState ? [...new Set(battleState.matches.map((m) => m.round))].sort((x, y) => x - y) : [];

  return (
    <main style={{ minHeight: '100vh', padding: '2rem 1.5rem 3rem', textAlign: 'center' }}>
      <h1 style={{ margin: 0, fontSize: 32 }}>⚔️ Batalla de Arte</h1>
      <p style={{ margin: '4px 0 1.25rem', color: 'var(--ink-dim)', fontSize: 13 }}>
        Sesión {sessionCode} · {connected ? `✅ ${voterCount} votante${voterCount === 1 ? '' : 's'}` : '⏳ conectando…'}
      </p>

      {tieToast && (
        <div style={{ margin: '0 auto 1rem', maxWidth: 300, padding: '0.6rem 1rem', borderRadius: 999, background: 'rgba(245,197,66,0.15)', border: '1px solid #f5c542' }}>
          🪙 ¡Empate! Se decidió cara o cruz
        </div>
      )}

      {championId ? (
        <Celebration
          dancerName={championEntry?.dancerName ?? '???'}
          imageUrl={championEntry?.files.champion ?? championEntry?.files.painting}
          votes={championVotes}
        />
      ) : currentMatch ? (
        <>
          <p style={{ margin: '0 0 1rem', fontSize: 16, fontWeight: 600, color: 'var(--accent)' }}>
            {secondsLeft !== null ? `${secondsLeft}s` : '—'}
          </p>
          <div style={{ display: 'flex', gap: 20, justifyContent: 'center', flexWrap: 'wrap', maxWidth: 760, margin: '0 auto' }}>
            {(['a', 'b'] as const).map((side) => {
              const entrant = currentMatch[side];
              if (!entrant) return <div key={side} style={{ width: 280 }} />;
              const pct = side === 'a' ? pctA : pctB;
              return (
                <div key={side} className="card" style={{ width: 280, overflow: 'hidden', borderRadius: 20 }}>
                  {entrant.thumb && <img src={entrant.thumb} alt={entrant.dancerName} style={{ width: '100%', height: 220, objectFit: 'cover', display: 'block' }} />}
                  <div style={{ padding: '0.75rem 1rem' }}>
                    <p style={{ margin: 0, fontSize: 17, fontWeight: 600 }}>{entrant.dancerName}</p>
                    {totalVotes > 0 && (
                      <>
                        <div style={{ height: 8, borderRadius: 999, background: 'rgba(255,255,255,0.15)', marginTop: 8, overflow: 'hidden' }}>
                          <div style={{ height: '100%', width: `${pct}%`, background: 'var(--accent)', transition: 'width 200ms ease' }} />
                        </div>
                        <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--ink-dim)' }}>{pct}% · {side === 'a' ? liveTally?.a : liveTally?.b} votos</p>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
          <p style={{ margin: '1rem 0 0', fontSize: 13, color: 'var(--ink-faint)' }}>Ronda {currentMatch.round}</p>
          <button onClick={lockNow} style={{ marginTop: 12, fontSize: 12, padding: '4px 14px', borderRadius: 999 }}>
            🔒 bloquear ahora
          </button>
        </>
      ) : (
        <p style={{ color: 'var(--ink-dim)', fontSize: 16, margin: '2rem 0' }}>
          {battleState ? 'Siguiente ronda…' : 'Esperando participantes…'}
        </p>
      )}

      {rounds.length > 0 && (
        <div style={{ margin: '2.5rem auto 0', maxWidth: 700 }}>
          {rounds.map((round) => (
            <div key={round} style={{ display: 'flex', gap: 8, justifyContent: 'center', marginBottom: 10, flexWrap: 'wrap' }}>
              {battleState!.matches.filter((m) => m.round === round).map((m) => (
                <div key={m.id} style={{ display: 'flex', gap: 4, alignItems: 'center', padding: '4px 8px', borderRadius: 10, background: 'rgba(255,255,255,0.06)', fontSize: 11 }}>
                  <span style={{ opacity: m.status === 'done' && m.winner !== 'a' ? 0.35 : 1 }}>{m.a?.dancerName ?? '(bye)'}</span>
                  <span style={{ opacity: 0.5 }}>vs</span>
                  <span style={{ opacity: m.status === 'done' && m.winner !== 'b' ? 0.35 : 1 }}>{m.b?.dancerName ?? '(bye)'}</span>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}

      {!championId && (
        <div style={{ margin: '2.5rem auto 0', maxWidth: 260 }}>
          <QRJoin sessionCode={sessionCode} peerCount={voterCount} path="/vote" />
        </div>
      )}
    </main>
  );
}
