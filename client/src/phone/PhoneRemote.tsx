// Phone as a remote control for the Stage (plan §K). Sends 'control' messages the host acts on.
import type { WsClient } from '../net/ws.ts';

interface Props {
  client: WsClient;
}

export function PhoneRemote({ client }: Props) {
  function send(action: 'start' | 'stop' | 'surprise') {
    client.send({ type: 'control', action });
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, maxWidth: 320, margin: '0 auto' }}>
      <button className="btn-primary" onClick={() => send('start')} style={{ padding: '1.1rem', borderRadius: 16, fontSize: 18 }}>
        ▶ Empezar a bailar
      </button>
      <button onClick={() => send('stop')} style={{ padding: '1.1rem', borderRadius: 16, fontSize: 18 }}>
        ■ Terminar
      </button>
      <button onClick={() => send('surprise')} style={{ padding: '1.1rem', borderRadius: 16, fontSize: 18 }}>
        🎲 Sorpréndeme
      </button>
    </div>
  );
}
