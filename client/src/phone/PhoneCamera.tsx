// Phone as a second camera angle over WebRTC (plan §K). The phone is always the offerer.
import { useEffect, useRef, useState } from 'react';
import type { RealtimeTransport } from '../net/transport.ts';
import { RtcPeer } from '../net/rtc.ts';

interface Props {
  client: RealtimeTransport;
  sessionCode: string;
}

export function PhoneCamera({ client }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const peerRef = useRef<RtcPeer | null>(null);
  const [status, setStatus] = useState<'requesting' | 'connecting' | 'connected' | 'failed'>('requesting');

  useEffect(() => {
    let stream: MediaStream | null = null;
    let cancelled = false;

    async function start() {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment', width: 1280 },
          audio: false,
        });
      } catch (err) {
        console.error('[phonecamera] getUserMedia failed', err);
        setStatus('failed');
        return;
      }
      if (cancelled) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
      if (videoRef.current) videoRef.current.srcObject = stream;

      setStatus('connecting');
      const peer = new RtcPeer(true, (msg) => client.send(msg));
      peerRef.current = peer;
      peer.onConnectionStateChange((state) => {
        if (state === 'connected') setStatus('connected');
        if (state === 'failed' || state === 'disconnected') setStatus('failed');
      });
      await peer.startAsOfferer(stream);
    }

    const offMsg = client.onMessage((msg) => {
      if (msg.type === 'rtc') void peerRef.current?.handleSignal(msg);
    });

    start();

    return () => {
      cancelled = true;
      offMsg();
      peerRef.current?.close();
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, [client]);

  return (
    <div>
      <video ref={videoRef} autoPlay playsInline muted style={{ width: '100%', maxWidth: 360, borderRadius: 12 }} />
      <p style={{ marginTop: 10, fontSize: 14, color: 'var(--ink-dim)' }}>
        {status === 'requesting' && 'Solicitando permiso de cámara…'}
        {status === 'connecting' && '⏳ Conectando con la pantalla principal…'}
        {status === 'connected' && '✅ Transmitiendo a la pantalla principal'}
        {status === 'failed' && '❌ No se pudo conectar. Intenta con "Subir un video" en su lugar.'}
      </p>
    </div>
  );
}
