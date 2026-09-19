// Role picker shown after a phone scans the QR and joins a session (plan §K).
import { useEffect, useRef, useState } from 'react';
import { getSessionCodeFromHash } from '../net/ws.ts';
import { createRealtimeClient, type RealtimeTransport } from '../net/transport.ts';
import { PhoneCamera } from './PhoneCamera.tsx';
import { PhoneRemote } from './PhoneRemote.tsx';
import { PhoneUpload } from './PhoneUpload.tsx';

type Role = 'camera' | 'remote' | 'upload' | null;

export function PhoneHome() {
  const [sessionCode] = useState(getSessionCodeFromHash);
  const [role, setRole] = useState<Role>(null);
  const [connected, setConnected] = useState(false);
  const clientRef = useRef<RealtimeTransport | null>(null);

  useEffect(() => {
    if (!sessionCode) return;
    const client = createRealtimeClient();
    clientRef.current = client;
    const off = client.onConnectionChange((c) => {
      setConnected(c);
      if (c) client.send({ type: 'join', session: sessionCode, role: 'phone' });
    });
    client.connect();
    return () => { off(); client.close(); };
  }, [sessionCode]);

  if (!sessionCode) {
    return (
      <main style={{ padding: '3rem 1.5rem', minHeight: '100vh', textAlign: 'center' }}>
        <h1 style={{ fontSize: 28 }}>Danza</h1>
        <p style={{ color: 'var(--ink-dim)' }}>Falta el código de sesión. Escanea el código QR de nuevo.</p>
      </main>
    );
  }

  return (
    <main style={{ padding: '2rem 1.25rem', minHeight: '100vh', textAlign: 'center' }}>
      <h1 style={{ fontSize: 26, margin: '0 0 4px' }}>Danza</h1>
      <p style={{ color: 'var(--ink-faint)', fontSize: 13, margin: '0 0 1.5rem' }}>
        Sesión {sessionCode} · {connected ? '✅ conectado' : '⏳ conectando…'}
      </p>

      {!role && connected && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, maxWidth: 320, margin: '0 auto' }}>
          <button className="btn-primary" onClick={() => setRole('camera')} style={{ padding: '1rem', borderRadius: 16, fontSize: 16 }}>
            📷 Cámara — segundo ángulo
          </button>
          <button onClick={() => setRole('remote')} style={{ padding: '1rem', borderRadius: 16, fontSize: 16 }}>
            🎮 Control remoto
          </button>
          <button onClick={() => setRole('upload')} style={{ padding: '1rem', borderRadius: 16, fontSize: 16 }}>
            📤 Subir un video
          </button>
        </div>
      )}

      {role && clientRef.current && (
        <>
          <button onClick={() => setRole(null)} style={{ marginBottom: 16, fontSize: 12, padding: '4px 12px', borderRadius: 999 }}>
            ← cambiar rol
          </button>
          {role === 'camera' && <PhoneCamera client={clientRef.current} sessionCode={sessionCode} />}
          {role === 'remote' && <PhoneRemote client={clientRef.current} />}
          {role === 'upload' && <PhoneUpload client={clientRef.current} sessionCode={sessionCode} />}
        </>
      )}
    </main>
  );
}
