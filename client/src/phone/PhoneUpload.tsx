// Phone video upload — the no-WebRTC fallback, and a way for a second dancer's clip to enter
// the pipeline (plan §K). uploadVideo() picks base64-to-Express (LAN) or a direct-to-Blob
// upload (hosted) depending on deployment mode — see net/api.ts.
import { useState } from 'react';
import type { RealtimeTransport } from '../net/transport.ts';
import { uploadVideo } from '../net/api.ts';

interface Props {
  client: RealtimeTransport;
  sessionCode: string;
}

export function PhoneUpload({ sessionCode }: Props) {
  const [status, setStatus] = useState<'idle' | 'uploading' | 'done' | 'error'>('idle');

  async function handleFile(file: File) {
    setStatus('uploading');
    try {
      await uploadVideo(sessionCode, file);
      setStatus('done');
    } catch (err) {
      console.error('[phoneupload] failed', err);
      setStatus('error');
    }
  }

  return (
    <div style={{ maxWidth: 320, margin: '0 auto' }}>
      {status === 'done' ? (
        <p style={{ fontSize: 16 }}>✅ ¡Video enviado! Se está procesando en la pantalla principal.</p>
      ) : (
        <>
          <label
            className="btn-primary"
            style={{ display: 'block', padding: '1.25rem', borderRadius: 16, fontSize: 16, cursor: 'pointer' }}
          >
            {status === 'idle' && '📤 Elegir video'}
            {status === 'uploading' && 'Enviando…'}
            {status === 'error' && '❌ Error — intenta de nuevo'}
            <input
              type="file"
              accept="video/*"
              onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
              disabled={status === 'uploading'}
              style={{ display: 'none' }}
            />
          </label>
          <p style={{ fontSize: 12, color: 'var(--ink-faint)', marginTop: 10 }}>
            Sube un video de baile grabado (hasta ~200MB).
          </p>
        </>
      )}
    </div>
  );
}
