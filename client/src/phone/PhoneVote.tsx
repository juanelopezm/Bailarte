// Guest voting UI for the art battle (plan §L). Two big tappable artwork cards; re-tapping
// switches your pick until the match locks. Server is authoritative for tallies — this only
// renders whatever it broadcasts.
import { useEffect, useRef, useState } from 'react';
import { WsClient, getSessionCodeFromHash, getDeviceToken } from '../net/ws.ts';
import type { BattleMatch, BattleState } from '@shared/types.ts';

export function PhoneVote() {
  const [sessionCode] = useState(getSessionCodeFromHash);
  const [connected, setConnected] = useState(false);
  const [battleState, setBattleState] = useState<BattleState | null>(null);
  const [tally, setTally] = useState<{ matchId: string; a: number; b: number; voters: number } | null>(null);
  const [myPick, setMyPick] = useState<'a' | 'b' | null>(null);
  const [now, setNow] = useState(Date.now());
  const clientRef = useRef<WsClient | null>(null);
  const deviceToken = useRef(getDeviceToken()).current;

  useEffect(() => {
    if (!sessionCode) return;
    const client = new WsClient();
    clientRef.current = client;
    const offConn = client.onConnectionChange((c) => {
      setConnected(c);
      if (c) client.send({ type: 'join', session: sessionCode, role: 'voter' });
    });
    const offMsg = client.onMessage((msg) => {
      if (msg.type === 'battle-state') {
        setBattleState(msg.state);
        setMyPick(null);
        setTally(null);
      } else if (msg.type === 'tally') {
        setTally({ matchId: msg.matchId, a: msg.a, b: msg.b, voters: msg.voters });
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

  function vote(pick: 'a' | 'b') {
    if (!currentMatch || currentMatch.status !== 'voting') return;
    setMyPick(pick);
    navigator.vibrate?.(50);
    clientRef.current?.send({ type: 'vote', matchId: currentMatch.id, pick, deviceToken });
  }

  if (!sessionCode) {
    return (
      <main style={{ padding: '3rem 1.5rem', minHeight: '100vh', textAlign: 'center' }}>
        <h1 style={{ fontSize: 28 }}>Votación</h1>
        <p style={{ color: 'var(--ink-dim)' }}>Falta el código de sesión. Escanea el código QR de nuevo.</p>
      </main>
    );
  }

  if (battleState?.championEntryId) {
    return (
      <main style={{ padding: '3rem 1.5rem', minHeight: '100vh', textAlign: 'center' }}>
        <p style={{ fontSize: 48 }}>🏆</p>
        <h1 style={{ fontSize: 26 }}>¡Ya hay campeón!</h1>
        <p style={{ color: 'var(--ink-dim)' }}>Mira la pantalla principal para la celebración.</p>
      </main>
    );
  }

  if (!currentMatch) {
    return (
      <main style={{ padding: '3rem 1.5rem', minHeight: '100vh', textAlign: 'center' }}>
        <h1 style={{ fontSize: 28 }}>Votación</h1>
        <p style={{ color: 'var(--ink-dim)' }}>
          {connected ? 'La batalla de arte comenzará pronto…' : '⏳ conectando…'}
        </p>
      </main>
    );
  }

  const totalVotes = tally && tally.matchId === currentMatch.id ? tally.a + tally.b : 0;
  const pctA = totalVotes > 0 && tally ? Math.round((tally.a / totalVotes) * 100) : 0;
  const pctB = totalVotes > 0 && tally ? 100 - pctA : 0;
  const secondsLeft = currentMatch.endsAt ? Math.max(0, Math.ceil((currentMatch.endsAt - now) / 1000)) : null;
  const locked = currentMatch.status !== 'voting';

  return (
    <main style={{ padding: '1.5rem 1rem 3rem', minHeight: '100vh', textAlign: 'center' }}>
      <h1 style={{ fontSize: 22, margin: '0 0 4px' }}>⚔️ Votación</h1>
      {secondsLeft !== null && (
        <p style={{ margin: '0 0 1.25rem', color: 'var(--accent)', fontSize: 15, fontWeight: 600 }}>
          {locked ? '🔒 votos cerrados' : `${secondsLeft}s restantes`}
        </p>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 14, maxWidth: 360, margin: '0 auto' }}>
        {(['a', 'b'] as const).map((side) => {
          const entrant = currentMatch[side];
          if (!entrant) return null;
          const picked = myPick === side;
          const pct = side === 'a' ? pctA : pctB;
          return (
            <button
              key={side}
              onClick={() => vote(side)}
              disabled={locked}
              className="card"
              style={{
                position: 'relative',
                padding: 0,
                overflow: 'hidden',
                borderRadius: 20,
                border: picked ? '3px solid var(--accent)' : '3px solid transparent',
                cursor: locked ? 'default' : 'pointer',
                textAlign: 'left',
              }}
            >
              {entrant.thumb && (
                <img src={entrant.thumb} alt={entrant.dancerName} style={{ width: '100%', height: 200, objectFit: 'cover', display: 'block' }} />
              )}
              <div style={{ padding: '0.6rem 0.9rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 15, fontWeight: 600 }}>
                  {picked && '✅ '}{entrant.dancerName}
                </span>
                {totalVotes > 0 && <span style={{ fontSize: 14, color: 'var(--ink-dim)' }}>{pct}%</span>}
              </div>
              {totalVotes > 0 && (
                <div style={{ height: 4, background: 'rgba(255,255,255,0.15)' }}>
                  <div style={{ height: '100%', width: `${pct}%`, background: 'var(--accent)', transition: 'width 200ms ease' }} />
                </div>
              )}
            </button>
          );
        })}
      </div>

      {myPick && !locked && (
        <p style={{ marginTop: 16, fontSize: 13, color: 'var(--ink-faint)' }}>Puedes cambiar tu voto mientras esté abierto.</p>
      )}
    </main>
  );
}
