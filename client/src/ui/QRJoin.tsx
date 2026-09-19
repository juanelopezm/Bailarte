// QR code + session code for phones to join (plan §K). Shown on the Stage before/after dancing.
import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { getHostInfo } from '../net/api.ts';
import { isHosted } from '../net/transport.ts';

interface Props {
  sessionCode: string;
  peerCount: number;
  /** Which phone route the QR points at — the phone-trio picker, or the battle voting screen. */
  path?: '/phone' | '/vote';
}

export function QRJoin({ sessionCode, peerCount, path = '/phone' }: Props) {
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [joinUrl, setJoinUrl] = useState<string | null>(null);
  const [showHelp, setShowHelp] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const baseUrl = isHosted ? Promise.resolve(location.origin) : getHostInfo().then(({ lanUrl }) => lanUrl);
    baseUrl
      .then((base) => {
        if (cancelled || !base) return;
        const url = `${base}/#${path}?s=${sessionCode}`;
        setJoinUrl(url);
        return QRCode.toDataURL(url, { width: 220, margin: 1, color: { dark: '#000000', light: '#ffffff' } });
      })
      .then((dataUrl) => {
        if (!cancelled && dataUrl) setQrDataUrl(dataUrl);
      })
      .catch((err) => console.warn('[qrjoin] failed to load host info', err));
    return () => { cancelled = true; };
  }, [sessionCode, path]);

  if (!qrDataUrl) {
    return (
      <p style={{ textAlign: 'center', color: 'var(--ink-faint)', fontSize: 12 }}>
        (No se detectó una IP de red local — el modo teléfono no está disponible en esta red)
      </p>
    );
  }

  return (
    <div className="card" style={{ maxWidth: 280, margin: '0 auto', padding: '1.25rem', textAlign: 'center' }}>
      <img src={qrDataUrl} alt="Código QR para unirse" style={{ width: '100%', borderRadius: 8, background: '#fff', padding: 8 }} />
      <p style={{ margin: '10px 0 0', fontSize: 14, color: 'var(--ink-dim)' }}>
        Código: <strong style={{ fontFamily: 'var(--font-display)', fontSize: 18, letterSpacing: '0.08em' }}>{sessionCode}</strong>
      </p>
      <p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--ink-faint)' }}>
        {peerCount} teléfono{peerCount === 1 ? '' : 's'} conectado{peerCount === 1 ? '' : 's'}
      </p>
      <button onClick={() => setShowHelp((v) => !v)} style={{ marginTop: 8, fontSize: 11, padding: '2px 10px', borderRadius: 999 }}>
        {showHelp ? 'ocultar ayuda' : '¿problemas para conectar?'}
      </button>
      {showHelp && (
        <p style={{ marginTop: 8, fontSize: 11, color: 'var(--ink-faint)', textAlign: 'left', lineHeight: 1.5 }}>
          {isHosted ? (
            'Cualquier red funciona — solo necesita internet.'
          ) : (
            <>El teléfono debe estar en la <strong>misma WiFi</strong>. Al abrir, el navegador mostrará una advertencia de
            certificado — en Safari: "Mostrar detalles → visitar este sitio web"; en Chrome: "Avanzado → Continuar".</>
          )}
          {joinUrl && <><br />URL: <code style={{ fontSize: 10 }}>{joinUrl}</code></>}
        </p>
      )}
    </div>
  );
}
