// Phone video upload — the no-WebRTC fallback, and a way for a second dancer's clip to enter
// the pipeline (plan §K). Reads the file as base64 and POSTs it; the server notifies the host.
import { useState } from 'react';
import type { WsClient } from '../net/ws.ts';
import { uploadVideo } from '../net/api.ts';

interface Props {
  client: WsClient;
  sessionCode: string;
}

function readFileAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(',')[1] ?? '');
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export function PhoneUpload({ sessionCode }: Props) {
  const [status, setStatus] = useState<'idle' | 'reading' | 'uploading' | 'done' | 'error'>('idle');

  async function handleFile(file: File) {
    setStatus('reading');
    try {
      const base64 = await readFileAsBase64(file);
      setStatus('uploading');
      await uploadVideo(sessionCode, file.name, base64);
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
            {status === 'reading' && 'Leyendo archivo…'}
            {status === 'uploading' && 'Enviando…'}
            {status === 'error' && '❌ Error — intenta de nuevo'}
            <input
              type="file"
              accept="video/*"
              onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
              disabled={status === 'reading' || status === 'uploading'}
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
