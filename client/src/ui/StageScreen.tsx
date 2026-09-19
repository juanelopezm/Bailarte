// The laptop/big-screen flow: setup -> dance -> reveal -> battle host.
// Phase 0: connectivity diagnostics only. Phase 1+ replaces the body with camera/pose/painting.
import { useEffect, useState } from 'react';
import { getHealth } from '../net/api.ts';
import { WsClient } from '../net/ws.ts';
import { useAppStore } from '../state/store.ts';

export function StageScreen() {
  const [apiOk, setApiOk] = useState<'checking' | 'ok' | 'fail'>('checking');
  const wsConnected = useAppStore((s) => s.wsConnected);
  const setWsConnected = useAppStore((s) => s.setWsConnected);

  useEffect(() => {
    getHealth()
      .then(() => setApiOk('ok'))
      .catch(() => setApiOk('fail'));

    const client = new WsClient();
    const offConn = client.onConnectionChange(setWsConnected);
    client.connect();
    client.send({ type: 'join', session: 'DIAG', role: 'host' });

    return () => {
      offConn();
      client.close();
    };
  }, [setWsConnected]);

  return (
    <main style={{ fontFamily: 'system-ui, sans-serif', padding: '3rem', color: '#eee', background: '#111', minHeight: '100vh' }}>
      <h1>Danza — Stage</h1>
      <p>Baila. Exprésate. Conviértete en arte.</p>
      <ul>
        <li>API: {apiOk === 'checking' ? 'checking…' : apiOk === 'ok' ? '✅ connected' : '❌ unreachable'}</li>
        <li>WebSocket hub: {wsConnected ? '✅ connected' : '⏳ connecting…'}</li>
      </ul>
    </main>
  );
}
